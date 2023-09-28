const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const crypto = require("crypto");

//
const User = require("../models/user");
const filterObject = require("../utils/filterObject");
const { promisify } = require("util");

const signToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);

// Signup => register => send OTP => verifyOTP
//

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

// Send OTP
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

// Verify OTP
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

// Login Validation
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

// Types of routes => Protected (Only logged in users can access these)
//                 => Unprotected
exports.protect = async (req, res, next) => {
  // Getting JWT Token and check if it's there

  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  } else {
    req.status(400).json({
      status: "Error",
      message: "You have to be logged in first! ",
    });
    return;
  }

  // Verfication of token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // Check if user still exists
  const this_user = await User.findById(decoded.userId);

  if (!this_user) {
    res.status(400).json({
      status: "error",
      message: "The user does not exist!",
    });
    return;
  }

  // Check if user changed their password after token was issued
  if (this_user.changedPasswordAfter(decoded.iat)) {
    res.status(404).json({
      status: "Error",
      message: "User recently updated password! Please log in again!",
    });
  }

  //
  req.user = this_user;
  next();
};

exports.forgetPassword = async (req, res, next) => {
  // Get User Email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    res.status(400).json({
      status: "error",
      message: "There is no user with given email address",
    });
    return;
  }

  // Generate Random Reset Token
  const resetToken = user.createPasswordResetToken();

  const resetURL = `http://talkspire.com/auth/reset-password/?code=${resetToken}`;
  try {
    // TODO => Send Email With Reset URL
    res.status(200).json({
      status: "success",
      message: "Reset Password Link sent to Email!",
    });
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save({ validateBeforeSave: false });

    res.status(500).json({
      status: "error",
      message: "There was an error sending the email, Please Try Again Later!",
    });
  }
};

exports.resetPassword = async (req, res, next) => {
  // Get User based on Token
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // If Token has expired or Submitted token out of time
  if (!user) {
    res.status(400).json({
      status: "Error",
      message: "Token is invalid or expired!",
    });
    return;
  }

  // Update User's password and set resetToken & expiry_time to undefined
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  // Log in to user and Send new JWT

  // TODO => send an email to user informing about password change
  const token = signToken(user._id);

  res.status(200).json({
    status: "Success",
    message: "Password Reset Sucessfully!",
    token,
  });
};
