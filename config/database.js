const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();
const MONGO_URI = process.env.MONGO_URI;

const connectDatabase = () => {
  mongoose
    .connect(MONGO_URI, {
      useNewUrlParser: true,
      useCreateIndex: true,
      useFindandModify: false,
      useUnifiedTopology: true,
    })
    .then(() => {
      console.log("Mongoose Connected");
    })
    .catch((err) => {
      console.log(err);
    });
};

module.exports = connectDatabase;
