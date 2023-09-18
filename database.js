const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI;

const connectDatabase = () => {
  mongoose
    .connect(MONGO_URI, {
    })
    .then(() => {
      console.log("Mongoose Connected!");
    })
    .catch((err) => {
      console.log(err);
    });
};

module.exports = connectDatabase;
