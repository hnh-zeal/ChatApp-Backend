const router = require("express").Router();

const authController = require("../controllers/auth");
const userController = require("../controllers/user");

router.post(
  "/generate-zego-token",
  authController.protect,
  userController.generateZegoToken
);
router.get("/get-call-logs", authController.protect, userController.getCallLogs);
router.get("/get-me", authController.protect, userController.getMe);
router.patch(
  "/update-profile",
  authController.protect,
  userController.updateProfile
);
router.get("/get-all-verified-users", authController.protect, userController.getAllVerifiedUsers);
router.get("/get-users", authController.protect, userController.getUsers);
router.get("/get-friends", authController.protect, userController.getFriends);
router.get(
  "/get-friend-requests",
  authController.protect,
  userController.getRequests
);

router.post("/start-audio-call", authController.protect, userController.startAudioCall);
router.post("/start-video-call", authController.protect, userController.startVideoCall);

module.exports = router;
