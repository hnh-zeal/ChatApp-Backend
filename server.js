const app = require("./app");
const connectDatabase = require("./database/database");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
dotenv.config();

const path = require("path");

process.on("uncaughtException", (err) => {
  console.log(`Error: ${err.message}`);
  process.exit(1); // Exit Code 1 indicates that a container shut down, either because of an application failure.
});

const { Server } = require("socket.io");

// Connect Database
connectDatabase();

// Models
const User = require("./models/user");
const Conversation = require("./models/conversation");
const FriendRequest = require("./models/friendRequest");
const AudioCall = require("./models/audioCall");
const VideoCall = require("./models/videoCall");

const http = require("http");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`App is running on port ${PORT}`);
});

// Listen for when the client connects via socket.io-client
io.on("connection", async (socket) => {
  // console.log(JSON.stringify(socket.handshake.query));
  const user_id = socket.handshake.query["user_id"];

  if (user_id != null && Boolean(user_id)) {
    try {
      await User.findByIdAndUpdate(user_id, {
        socket_id: socket.id,
        status: "Online",
      });
    } catch (e) {
      console.log(e);
    }
  }

  // -------------- HANDLE Friend Request and Conversation SOCKET EVENTS ----------------- //
  socket.on("friend_request", async (data) => {
    // console.log(data);

    // {to: "user_id", from}

    const to_user = await User.findById(data.to).select(
      "socket_id firstName lastName"
    );
    const from_user = await User.findById(data.from).select(
      "socket_id firstName lastName"
    );

    const friendRequest = await FriendRequest.findOne({
      sender: from_user,
      recipient: to_user,
    });

    if (!friendRequest) {
      // Create a friend request
      await FriendRequest.create({
        sender: data.from,
        recipient: data.to,
      });

      // emit event => "new_friend_request"
      io.to(to_user?.socket_id).emit("new_friend_request", {
        message: "New Friend Request Received!",
      });

      // emit event => "request_sent"
      io.to(from_user?.socket_id).emit("request_sent", {
        message: "Friend Request Sent!",
      });
    } else {
      // emit event => "request_sent"
      io.to(from_user?.socket_id).emit("request_sent", {
        message: "Friend Request is already Sent!",
      });
    }
  });

  socket.on("accept_request", async (data) => {
    // accept friend request => add ref of each other in friends array
    const request_doc = await FriendRequest.findById(data.request_id);

    const sender = await User.findById(request_doc.sender);
    const recipient = await User.findById(request_doc.recipient);

    sender.friends.push(request_doc.recipient);
    recipient.friends.push(request_doc.sender);

    await recipient.save({ new: true, validateModifiedOnly: true });
    await sender.save({ new: true, validateModifiedOnly: true });

    // Delete the Friend Request after Accepted
    await FriendRequest.findByIdAndDelete(data.request_id);

    io.to(sender?.socket_id).emit("request_accepted", {
      message: "Friend Request Accepted!",
    });

    io.to(recipient?.socket_id).emit("request_accepted", {
      message: "Friend Request Accepted!",
    });
  });

  socket.on("cancel_request", async (data) => {
    // cancel friend request => delete the friend Requests
    const request_doc = await FriendRequest.findById(data.request_id);

    // console.log(request_doc);

    const sender = await User.findById(request_doc.sender);

    await request_doc.deleteOne({ _id: request_doc._id });

    io.to(sender?.socket_id).emit("request_accepted", {
      message: "Friend Request Cancelled!",
    });

    // io.to(recipient?.socket_id).emit("request_accepted", {
    //   message: "Friend Request Accepted!",
    // });
  });

  socket.on("get_conversations", async ({ user_id }, callback) => {
    const userObjectId = new mongoose.Types.ObjectId(user_id);
    const conversations = await User.aggregate([
      {
        $match: {
          _id: userObjectId,
        },
      },
      {
        $lookup: {
          from: "conversations",
          localField: "conversations",
          foreignField: "_id",
          as: "conversationsData",
        },
      },
      {
        $project: {
          conversations: "$conversationsData",
        },
      },
      {
        $unwind: "$conversations",
      },
      {
        $addFields: {
          lastMessage: { $slice: ["$conversations.messages", -1] },
        },
      },
      {
        $sort: { "lastMessage.created_at": -1 },
      },
      {
        $lookup: {
          from: "users",
          localField: "conversations.participants",
          foreignField: "_id",
          as: "participantsData",
        },
      },
      {
        $project: {
          _id: "$conversations._id",
          participants: "$participantsData",
          messages: "$conversations.messages",
          lastMessage: 1,
        },
      },
    ]);
    callback(conversations);
  });

  socket.on("start_conversation", async (data) => {
    const { to, from } = data;

    // Check if there is an existing conversation between to and from
    const existingConversation = await Conversation.findOne({
      participants: { $all: [to, from], $size: 2 },
    }).populate("participants", "firstName lastName _id email status");

    const contact = await User.findById(to);

    const returnData = {
      new_chat:
        existingConversation ||
        (await Conversation.create({ participants: [to, from] })),
      contact,
    };

    returnData.new_chat = await Conversation.findById(
      returnData.new_chat._id
    ).populate("participants", "firstName lastName _id email status");

    socket.emit("open_chat", returnData);
  });

  socket.on("get_current_conversation", async (data, callback) => {
    try {
      if (data.conversation_id && data.user_id) {
        const { messages } = await Conversation.findById(
          data.conversation_id
        ).select("messages");

        const contact_user = await User.findById(data.user_id);
        callback({
          messages: messages,
          contact: contact_user,
        });
      }
    } catch (error) {
      console.log(error);
    }
  });

  // Handle Text/Link Messages
  socket.on("text_message", async (data) => {
    // data: { to, from, message, conversation_id, type }
    const { to, from, message, conversation_id, type } = data;

    const to_user = await User.findById(to);
    const from_user = await User.findById(from);

    const new_message = {
      to,
      from,
      type,
      text: message,
      created_at: Date.now(),
    };

    // create a new conversation if it doesn't exist or add new messages to the messages list
    const conversation = await Conversation.findById(conversation_id);

    if (!to_user.conversations.includes(conversation._id)) {
      to_user.conversations.push(conversation);
      await to_user.save({ new: true, validateModifiedOnly: true });
    }
    if (!from_user.conversations.includes(conversation._id)) {
      from_user.conversations.push(conversation);
      await from_user.save({ new: true, validateModifiedOnly: true });
    }

    conversation.populate(
      "participants",
      "_id firstName lastName email status"
    );
    conversation.messages.push(new_message);

    // save to db
    await conversation.save({});

    // emit incoming_message => to user
    io.to(to_user?.socket_id).emit("new_message", {
      conversation,
      message: new_message,
    });

    // emit outgoing message => from user
    io.to(from_user?.socket_id).emit("new_message", {
      conversation,
      message: new_message,
    });
  });

  socket.on("file_message", async (data) => {
    // data => { to, from, text, file }
    // console.log("Received Message:", data);

    // get the file extension
    const fileExtension = path.extname(data.file.name);

    // generate a unique filename
    const fileName = `${Date.now()}_${Math.floor(
      Math.random() * 10000
    )}${fileExtension}`;

    // upload file to AWS s3

    // create a new conversation if it doesn't exist or add new messages to the messages list
    // save to db
    // emit incoming_message => to user
    // emit outgoing message => from user
  });

  socket.on("clear_messages", async (data, callback) => {
    const { user_id, conversation_id } = data;
    const userObjectId = new mongoose.Types.ObjectId(user_id);
    const conversationId = new mongoose.Types.ObjectId(conversation_id);

    // Delete the messages from conversation with conversationId
    const updatedConversation = await Conversation.findOneAndUpdate(
      { _id: conversationId },
      { $set: { messages: [] } },
      { new: true }
    );
    callback(updatedConversation);
  });

  socket.on("delete_conversation", async (data) => {
    const { user_id, conversation_id } = data;

    const userObjectId = new mongoose.Types.ObjectId(user_id);
    const conversationId = new mongoose.Types.ObjectId(conversation_id);

    // Delete the conversation from both users
    const conversation = await Conversation.findOne({
      _id: conversationId,
    });

    console.log(conversation.participants);

    const users = await User.updateMany(
      { _id: { $in: conversation.participants } },
      {
        $pull: { conversations: conversationId },
      },
      { new: true }
    );
    // console.log(users);
  });
  // ---------------------------------------------------------------- //

  // -------------- HANDLE AUDIO CALL SOCKET EVENTS ----------------- //
  // handle start_audio_call event
  socket.on("start_audio_call", async (data) => {
    const { from, to, roomID } = data;

    const to_user = await User.findById(to);
    const from_user = await User.findById(from);

    console.log("to_user", to_user);

    // send notification to receiver of call
    io.to(to_user?.socket_id).emit("audio_call_notification", {
      from: from_user,
      roomID,
      streamID: from,
      userID: to,
      userName: to,
    });
  });

  // handle audio_call_not_picked
  socket.on("audio_call_not_picked", async (data) => {
    console.log(data);
    // find and update call record
    const { to, from } = data;

    const to_user = await User.findById(to);

    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Missed", status: "Ended", endedAt: Date.now() }
    );

    // TODO => emit call_missed to receiver of call
    io.to(to_user?.socket_id).emit("audio_call_missed", {
      from,
      to,
    });
  });

  // handle audio_call_accepted
  socket.on("audio_call_accepted", async (data) => {
    const { to, from } = data;

    const from_user = await User.findById(from);

    // find and update call record
    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Accepted" }
    );

    // TODO => emit call_accepted to sender of call
    io.to(from_user?.socket_id).emit("audio_call_accepted", {
      from,
      to,
    });
  });

  // handle audio_call_denied
  socket.on("audio_call_denied", async (data) => {
    // find and update call record
    const { to, from } = data;

    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Denied", status: "Ended", endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    // TODO => emit call_denied to sender of call

    io.to(from_user?.socket_id).emit("audio_call_denied", {
      from,
      to,
    });
  });

  // handle user_is_busy_audio_call
  socket.on("user_is_busy_audio_call", async (data) => {
    const { to, from } = data;
    // find and update call record
    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Busy", status: "Ended", endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    // TODO => emit on_another_audio_call to sender of call
    io.to(from_user?.socket_id).emit("on_another_audio_call", {
      from,
      to,
    });
  });
  // ---------------------------------------------------------------- //

  // -------------- HANDLE Video CALL SOCKET EVENTS ----------------- //
  // handle start_video_call event
  socket.on("start_video_call", async (data) => {
    const { from, to, roomID } = data;

    console.log(data);

    const to_user = await User.findById(to);
    const from_user = await User.findById(from);

    console.log("to_user", to_user);

    // send notification to receiver of call
    io.to(to_user?.socket_id).emit("video_call_notification", {
      from: from_user,
      roomID,
      streamID: from,
      userID: to,
      userName: to,
    });
  });

  // handle video_call_not_picked
  socket.on("video_call_not_picked", async (data) => {
    console.log(data);
    // find and update call record
    const { to, from } = data;

    const to_user = await User.findById(to);

    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Missed", status: "Ended", endedAt: Date.now() }
    );

    // TODO => emit call_missed to receiver of call
    io.to(to_user?.socket_id).emit("video_call_missed", {
      from,
      to,
    });
  });

  // handle video_call_accepted
  socket.on("video_call_accepted", async (data) => {
    const { to, from } = data;

    const from_user = await User.findById(from);

    // find and update call record
    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Accepted" }
    );

    // TODO => emit call_accepted to sender of call
    io.to(from_user?.socket_id).emit("video_call_accepted", {
      from,
      to,
    });
  });

  // handle video_call_denied
  socket.on("video_call_denied", async (data) => {
    // find and update call record
    const { to, from } = data;

    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Denied", status: "Ended", endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    // TODO => emit call_denied to sender of call

    io.to(from_user?.socket_id).emit("video_call_denied", {
      from,
      to,
    });
  });

  // handle user_is_busy_video_call
  socket.on("user_is_busy_video_call", async (data) => {
    const { to, from } = data;
    // find and update call record
    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Busy", status: "Ended", endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    // TODO => emit on_another_video_call to sender of call
    io.to(from_user?.socket_id).emit("on_another_video_call", {
      from,
      to,
    });
  });
  // ---------------------------------------------------------------- //

  socket.on("end", async (data) => {
    // Find user by _id and set status to Offline
    if (data.user_id) {
      await User.findByIdAndUpdate(data.user_id, { status: "Offline" });
    }

    console.log("Closing Connection!");
    socket.disconnect(0);
  });
});

process.on("unhandledRejection", (err) => {
  console.log(err);
  console.log("UNHANDLED REJECTION! Shutting down ...");
  server.close(() => {
    process.exit(1); //  Exit Code 1 indicates that a container shut down, either because of an application failure.
  });
});
