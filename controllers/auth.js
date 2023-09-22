const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");

//
const User = require("../models/user");
const filterObject = require("../utils/filterObject");

const signToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);

// Register New User
exports.register = async (req, res, next) => {
  const [firistName, lastName, email, password] = req.body;

  const filterBody = filterObject(
    req.body,
    "firistName",
    "lastName",
    "email",
    "password"
  );

  // Check if a verified user with given email exists

  const existing_user = await User.findOne({ email: email });

  if (existing_user && existing_user.verified) {
    res.status(400).json({
      status: "Error",
      message: "Email is already verified. Please Login!",
    });
  } else if (existing_user) {
    const updatedUser = await User.findOneAndUpdate(
      { email: email },
      filterBody,
      { new: true, validateModifiedOnly: true }
    );
    req.userId = existing_user._id;
    next();
  } else {
    // create if no user matches with the email verified
    const new_user = await User.create(filterBody);

    // generate OTP and send email to the User
    req.userId = new_user._id;
    next();
  }
};

exports.sendOTP = async (req, res, next) => {
  const { userId } = req;
  const new_OTP = otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });

  const otp_expiry_time = Date.now() + 10 * 60 * 1000; // 10 minutes after OTP is sent

  await User.findByIdAndUpdate(userId, {
    otp: new_otp,
    otp_expiry_time,
  });

  // TODO Send Mail

  res.status(200).json({
    status: "Success",
    message: "OTP Sent Successfully!",
  });
};

exports.verifyOTP = async (req, res, next) => {
  // verify OTP and update User record accordingly

  const { email, OTP } = req.body;
  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400).json({
      status: "Error",
      message: "Email is invalid or OTP is expired!",
    });
  }

  if (!(await user.correctOTP(OTP, user.otp))) {
    res.status(400).json({
      status: "Error",
      message: "Invalid OTP!",
    });
  }

  // OTP is correct
  user.verified = true;
  user.otp = undefined;
  user.otp_expiry_time = undefined;

  await user.save({ new: true, validateModifiedOnly: true });

  const token = signToken(user._id);

  res.status(200).json({
    status: "Success",
    message: "OTP is verified sucessfully!",
    token,
  });
};

exports.login = async (req, res, next) => {
  //
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      status: "Error",
      message: "Both email and password are required!",
    });
  }

  const user = await User.findOne({ email: email }).select("+password");

  if (!user || !(await user.correctPassword(password, user.password))) {
    res.status(400).json({
      status: "Error",
      message: "Email or password is incorrect!",
    });
  }

  const token = signToken(user._id);

  res.status(200).json({
    status: "Success",
    message: "Logged in sucessfully!",
    token,
  });
};

exports.forgetPassword = async (req, res, next) => {
  //
};

exports.resetPassword = async (req, res, next) => {
  //
}
