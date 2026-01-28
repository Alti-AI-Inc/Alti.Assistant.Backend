const express = require("express");
const router = express.Router();
const forumController = require("./forum.controller");
const commentController = require("./forum.controller");
const { validateRequest } = require("../../middlewares/validateRequest/validateRequest");
const { extractTenantContext } = require("../../middlewares/tenant/tenantContext");
const forumUserActivitiesValidationSchema = require("./forum.validation");
// const { authController } = require("../auth/auth.controller");


router
  .route("/:id")
  .get(extractTenantContext, forumController.getForumById)
  .patch(extractTenantContext, forumController.updateForum)
  .delete(extractTenantContext, forumController.deleteForum);
router.route("/comment/:commentId").get(extractTenantContext, commentController.getComment)

router.route("/deleteComment/:id")
  .delete(extractTenantContext, commentController.deleteComment);

router.route("/getBlogByEmail/:email")
  .get(extractTenantContext, commentController.getForumByEmail);

router.route("/")
  .get(extractTenantContext, forumController.getForum)
  .get(extractTenantContext, forumController.getForumSuggestion)
  .post(extractTenantContext, forumController.addForum);

router.route("/blog-suggestion/:suggestion").get(extractTenantContext, forumController.getForumSuggestion)

router.route("/userForumActivity").post(extractTenantContext, commentController.addUserForumActivity);


module.exports = router;
