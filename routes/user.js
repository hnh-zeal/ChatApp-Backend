const router = require("express").Router();

const authController = require("../controllers/auth");
const userController = require("../controllers/user");

router.patch(
  "/update-profile",
  authController.protect,
  userController.updateProfile
);
router.get("/get-users", authController.protect, userController.getUsers);
router.get("/get-friends", authController.protect, userController.getFriends);
router.get(
  "/get-friend-requests",
  authController.protect,
  userController.getRequests
);

module.exports = router;
