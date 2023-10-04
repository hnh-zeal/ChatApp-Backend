const express = require("express"); // web framework for node js

const routes = require("./routes");

const morgan = require("morgan"); // Http request logger middleware for node js

const rateLimit = require("express-rate-limit"); //

const helmet = require("helmet");

const mongosanitize = require("express-mongo-sanitize"); //

const bodyParser = require("body-parser");

const xss = require("xss");

const cors = require("cors");

const dotenv = require("dotenv");
dotenv.config();

// App
const app = express();

// middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "PATCH", "POST", "DELETE", "PUT"],
  credentials: true,
}));

app.use(
    express.urlencoded({
      extended: true,
    })
  );
  
app.use(mongosanitize());
  
//   app.use(xss());

app.use(express.json({ limit: "10kb" }));
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.use(helmet());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

const limiter = rateLimit({
  max: 3000,
  windowMs: 60 * 60 * 1000, // In one hour
  message: "Too many requests from this IP, Please try again in an hour!",
});

app.use("/talkspire", limiter);

app.use(
  express.urlencoded({
    extended: true,
  })
); // Returns middleware that only parses urlencoded bodies

// Routes
app.use(routes);

app.get('/', (req, res) => {
  res.send('Hello to Backend API!');
})

// const PORT = process.env.PORT || 5000;

// app.listen(PORT, () => console.log(`Server Running on Port: http://localhost:${PORT}`));

module.exports = app;
