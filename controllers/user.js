const AudioCall = require("../models/audioCall");
const Conversation = require("../models/conversation");
const FriendRequest = require("../models/friendRequest");
const User = require("../models/user");
const VideoCall = require("../models/videoCall");
const catchAsync = require("../utils/catchAsync");
const filterObj = require("../utils/filterObject");

const { generateToken04 } = require("./zego");

const appID = process.env.ZEGO_APP_ID;

const serverSecret = process.env.ZEGO_SERVER_SECRET; // type: 32 byte length string

exports.getMe = async (req, res, next) => {

  const conversations = await User.aggregate([
    {
      $match: {
        _id: req.user._id,
      },
    },
    {
      $lookup: {
        from: 'conversations', // Assuming the name of the conversations collection
        localField: 'conversations',
        foreignField: '_id',
        as: 'conversationsData',
      },
    },
    {
      $project: {
        conversations: '$conversationsData',
      },
    },
    {
      $unwind: '$conversations',
    },
    {
      $addFields: {
        lastMessage: { $slice: ['$conversations.messages', -1] },
      },
    },
    {
      $sort: { 'lastMessage.created_at': -1 },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'conversations.participants',
        foreignField: '_id',
        as: 'participantsData',
      },
    },
    {
      $project: {
        _id: '$conversations._id',
        participants: '$participantsData',
        messages: '$conversations.messages',
        lastMessage: 1,
      },
    },
  ]);

  res.status(200).json({
    status: "success",
    data: {
      user: req.user,
      conversations: conversations,
    },
  });
};

exports.updateProfile = catchAsync(async (req, res, next) => {
  const { user } = req;

  const filterBody = filterObj(
    req.body,
    "firstName",
    "lastName",
    "bio",
    "avatar"
  );

  const updated_user = await User.findByIdAndUpdate(user._id, filterBody, {
    new: true,
    validateModifyOnly: true,
  });

  res.status(200).json({
    status: "Success",
    data: updated_user,
    message: "Profile Updated Successfully!",
  });
});

// This is from Explore Users => Return users who has not sent requests to current user
exports.getUsers = async (req, res, next) => {
  const friendRequests = await FriendRequest.find({
    $or: [{ recipient: req.user._id }, { sender: req.user._id }],
  });

  const all_users = await User.find({
    $and: [
      { verified: true }, // Users must have verified: true
      { _id: { $ne: req.user._id } }, // Exclude the current user
      { _id: { $nin: friendRequests.map((user) => user.recipient._id) } }, // Exclude users in sent_requests
      { _id: { $nin: friendRequests.map((user) => user.sender._id) } }, // Exclude users in requests
    ],
  }).select("firstName lastName _id");

  // console.log("All Users", all_users);

  const this_user = req.user;

  const remaining_users = all_users.filter(
    (user) => !this_user.friends.includes(user._id)
  );

  res.status(200).json({
    status: "Success",
    data: remaining_users,
    message: "Users found successfully!",
  });
};

exports.getAllVerifiedUsers = catchAsync(async (req, res, next) => {
  const all_users = await User.find({
    verified: true,
  }).select("firstName lastName _id");

  const remaining_users = all_users.filter(
    (user) => user._id.toString() !== req.user._id.toString()
  );

  res.status(200).json({
    status: "success",
    data: remaining_users,
    message: "Users found successfully!",
  });
});

exports.getRequests = catchAsync(async (req, res, next) => {
  const requests = await FriendRequest.find({ recipient: req.user._id })
    .populate("sender")
    .select("_id firstName lastName");

  // console.log(requests);

  res.status(200).json({
    status: "success",
    data: requests,
    message: "Requests found successfully!",
  });
});

exports.sentRequests = catchAsync(async (req, res, next) => {
  const requests = await FriendRequest.find({ sender: req.user._id })
    .populate("recipient")
    .select("_id firstName lastName");

  res.status(200).json({
    status: "success",
    data: requests,
    message: "Requests found successfully!",
  });
});

exports.getFriends = catchAsync(async (req, res, next) => {
  const this_user = await User.findById(req.user._id).populate(
    "friends",
    "_id firstName lastName"
  );

  res.status(200).json({
    status: "Success",
    data: this_user.friends,
    message: "Friends found successfully!",
  });
});

exports.generateZegoToken = catchAsync(async (req, res, next) => {
  try {
    const { userId, room_id } = req.body;

    console.log(userId, room_id, "from generate zego token");

    const effectiveTimeInSeconds = 3600; //type: number; unit: s; token expiration time, unit: second
    const payloadObject = {
      room_id, // Please modify to the user's roomID
      // The token generated allows loginRoom (login room) action
      // The token generated in this example allows publishStream (push stream) action
      privilege: {
        1: 1, // loginRoom: 1 pass , 0 not pass
        2: 1, // publishStream: 1 pass , 0 not pass
      },
      stream_id_list: null,
    }; //
    const payload = JSON.stringify(payloadObject);
    // Build token
    const token = generateToken04(
      appID * 1, // APP ID NEEDS TO BE A NUMBER
      userId,
      serverSecret,
      effectiveTimeInSeconds,
      payload
    );
    res.status(200).json({
      status: "success",
      message: "Token generated successfully",
      token,
    });
  } catch (err) {
    console.log(err);
  }
});

exports.startAudioCall = catchAsync(async (req, res, next) => {
  const from = req.user._id;
  const to = req.body.id;

  const from_user = await User.findById(from);
  const to_user = await User.findById(to);

  // create a new call audioCall Doc and send required data to client
  const new_audio_call = await AudioCall.create({
    participants: [from, to],
    from,
    to,
    status: "Ongoing",
  });

  res.status(200).json({
    data: {
      from: to_user,
      roomID: new_audio_call._id,
      streamID: to,
      userID: from,
      userName: from,
    },
  });
});

exports.startVideoCall = catchAsync(async (req, res, next) => {
  const from = req.user._id;
  const to = req.body.id;

  const from_user = await User.findById(from);
  const to_user = await User.findById(to);

  // create a new call videoCall Doc and send required data to client
  const new_video_call = await VideoCall.create({
    participants: [from, to],
    from,
    to,
    status: "Ongoing",
  });

  res.status(200).json({
    data: {
      from: to_user,
      roomID: new_video_call._id,
      streamID: to,
      userID: from,
      userName: from,
    },
  });
});

exports.getCallLogs = catchAsync(async (req, res, next) => {
  const user_id = req.user._id;

  const call_logs = [];

  const audio_calls = await AudioCall.find({
    participants: { $all: [user_id] },
  }).populate("from to");

  const video_calls = await VideoCall.find({
    participants: { $all: [user_id] },
  }).populate("from to");

  console.log(audio_calls, video_calls);

  for (let elm of audio_calls) {
    const missed = elm.verdict !== "Accepted";
    if (elm.from._id.toString() === user_id.toString()) {
      const other_user = elm.to;

      // outgoing
      call_logs.push({
        id: elm._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      });
    } else {
      // incoming
      const other_user = elm.from;

      // outgoing
      call_logs.push({
        id: elm._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      });
    }
  }

  for (let element of video_calls) {
    const missed = element.verdict !== "Accepted";
    if (element.from._id.toString() === user_id.toString()) {
      const other_user = element.to;

      // outgoing
      call_logs.push({
        id: element._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      });
    } else {
      // incoming
      const other_user = element.from;

      // outgoing
      call_logs.push({
        id: element._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      });
    }
  }

  res.status(200).json({
    status: "success",
    message: "Call Logs Found successfully!",
    data: call_logs,
  });
});
