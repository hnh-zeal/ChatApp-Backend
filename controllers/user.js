const User = require("../models/user");
const filterObject = require("../utils/filterObject");

exports.updateProfile = async (req, res, next) => {
  const { user } = req;

  const filterBody = filterObject(
    req.body,
    "firistName",
    "lastName",
    "about",
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
};