const app = require("./app");
const connectDatabase = require("./database/database");
const dotenv = require("dotenv");
dotenv.config();

const { Server } = require("socket.io");

process.on("uncaughtException", (err) => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});

// Connect Database
connectDatabase();

const http = require("http");

const User = require("./models/user");
const FriendRequest = require("./models/friendRequest");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

io.on("connection", async (socket) => {
  console.log(JSON.stringify(socket.handshake.query));
  const user_id = socket.handshake.query["user_id"];

  const socket_id = socket.id;

  console.log(`User Connected ${socket_id}`);

  if (Boolean(user_id)) {
    await User.findByIdAndUpdate(user_id, { socket_id });
  }

  // We can write our socket event listeners here...
  socket.on("friend_request", async (data) => {
    console.log(data.to);

    // {to: "user_id", from}

    const to_user = await User.findById(data.to).select("socket_id");
    const from_user = await User.findById(data.from).select("socket_id");

    // Create a friend request
    await FriendRequest.create({
      sender: data.from,
      recipient: data.to,
    });

    // emit event => "new_friend_request"
    io.to(to_user.socket_id).emit("new_friend_request", {
      message: "New Friend Request Received!",
    });

    // emit event => "request_sent"
    io.to(from_user.socket_id).emit("request_sent", {
      message: "Friend Request Sent!",
    });
  });

  socket.on("accept_request", async (data) => {
    // console.log(data);
    const request_doc = await FriendRequest.findById(data.request_id);

    const sender = await User.findById(request_doc.sender);
    const recipient = await User.findById(request_doc.recipient);

    sender.friends.push(request_doc.recipient);
    recipient.friends.push(request_doc.sender);

    await recipient.save({ new: true, validateModifiedOnly: true });
    await sender.save({ new: true, validateModifiedOnly: true });

    // Delete the Friend Request after Accepted
    await FriendRequest.findByIdAndDelete(data.request_id);

    io.to(sender.socket_id).emit("request_accepted", {
      message: "Friend Request Accepted!",
    });

    io.to(recipient.socket_id).emit("request_accepted", {
      message: "Friend Request Accepted!",
    });
  });

  socket.on("end", function () {
    console.log("Closing Connection!");
    socket.disconnect(0);
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`App is running on port ${PORT}`);
});

process.on("unhandledRejection", (err) => {
  console.log(`Error: ${err}`);
  server.close(() => {
    process.exit(1);
  });
});
