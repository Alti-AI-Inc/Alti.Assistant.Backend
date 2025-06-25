const express = require("express");
const router = express.Router();
const forumController = require("./forum.controller");
const commentController = require("./forum.controller");
const { validateRequest } = require("../../middlewares/validateRequest/validateRequest");
const forumUserActivitiesValidationSchema = require("./forum.validation");
// const { authController } = require("../auth/auth.controller");


router
  .route("/:id")
  .get(forumController.getForumById)
  .patch(forumController.updateForum)
  .delete(forumController.deleteForum);
router.route("/comment/:commentId").get(commentController.getComment)

router.route("/deleteComment/:id")
  .delete(commentController.deleteComment);

router.route("/getBlogByEmail/:email")
  .get(commentController.getForumByEmail);

router.route("/")
  .get(forumController.getForum)
  .get(forumController.getForumSuggestion)
  .post(forumController.addForum);

router.route("/blog-suggestion/:suggestion").get(forumController.getForumSuggestion)

router.route("/userForumActivity").post(commentController.addUserForumActivity);


module.exports = router;
