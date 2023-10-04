const router = require("express").Router();

const authController = require("../controllers/auth");
const userController = require("../controllers/user");

router.patch(
  "/update-profile",
  authController.protect,
  userController.updateProfile
);



module.exports = router;
