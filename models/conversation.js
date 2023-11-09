const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
  ],
  messages: [
    {
      to: { type: mongoose.Schema.ObjectId, ref: "User" },
      from: { type: mongoose.Schema.ObjectId, ref: "User" },
      type: { type: String, enum: ["Text", "Media", "Document"] },
      created_at: { type: Date, default: Date.now() },
      text: { type: String },
      file: { type: String },
    },
  ],
  chat_type: {
    type: String,
    enum: ["group", "individual"],
  },
});

const Conversation = new mongoose.model("Conversation", conversationSchema);

module.exports = Conversation;
