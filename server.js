const app = require("./app");
const connectDatabase = require('./config/database');
const dotenv = require("dotenv");
dotenv.config();

process.on("uncaughtException", (err) => {
  console.log(err);
  process.exit(1);
});

connectDatabase();

const http = require("http");

const server = http.createServer(app);

const port = process.env.PORT || 8000;

server.listen(port, () => {
  console.log(`App is running on port ${port}`);
});

process.on("unhandledRejection", (err) => {
  console.log(err);
  server.close(() => {
    process.exit(1);
  });
});
