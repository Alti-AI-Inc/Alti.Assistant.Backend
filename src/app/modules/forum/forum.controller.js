
const pick = require("../../middlewares/other/pick");
const { paginationFields } = require("./forum.constant");
const {

  deleteCommentServices,
  getCommnetService,
  getForumService,
  getForumServiceById,
  getForumServiceByEmail,
  updateForumService,
  deleteForumService,
  getForumSuggestionService,
  addUserForumActivityServices,
} = require("./forum.service");
const { addForumServices } = require("./forum.service");

module.exports.addForum = async (req, res, next) => {
  // logger.info(req.body, "blog dataaaa");
  try {
    const data = req.body;
    const result = await addForumServices(data);

    res.status(200).json({
      status: "success",
      message: "Add Forum Successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: "Forum doesn't add successfully",
      error: error.message,
    });
  }
};

module.exports.getForum = async (req, res) => {
  try {

    const filters = pick(req.query, ["searchTerm", "title",  "category"]);

    const paginationOptions = pick(req.query, paginationFields);

    const result = await getForumService(filters, paginationOptions);
    // const result = await getBlogService(req.body)

    res.status(200).json({
      status: "success",
      message: "Get Forums Successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: "Couldn't get fourms successfully",
      error: error.message,
    });
  }
};

module.exports.getForumById = async (req, res) => {
  const { id } = req.params;
  logger.info(id, 'blog idddd');
  try {
    const result = await getForumServiceById(id);
    res.status(200).json({
      status: "Success",
      message: "Get forum by id successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: "Couldn't not get forum by id",
      error: error.message,
    });
  }
};


module.exports.getForumByEmail = async (req, res) => {
  const { email } = req.params;
  logger.info(email, 'blog email');
  try {
    const result = await getForumServiceByEmail(email);
    res.status(200).json({
      status: "Success",
      message: "Get forum by email successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: "Couldn't not get forum by email",
      error: error.message,
    });
  }
};

exports.updateForum = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await updateForumService(id, req.body);
    res.status(200).json({
      status: "Success",
      message: "Forum Update Successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "Fail",
      message: "Forum couldn't Update Successfully",
      error: error.message,
    });
    logger.info(error, "error");
  }
};

exports.deleteForum = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteForumService(id);

    if (!result.deletedCount) {
      return res.status(400).json({
        status: "fail",
        error: "Could't delete the forum",
      });
    }
    res.status(200).json({
      status: "Success",
      message: "Forum Delete Successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "Fail",
      message: "Forum couldn't Delete Successfully",
      error: error.message,
    });
    logger.info(error, "error");
  }
};

module.exports.getForumSuggestion = async (req, res) => {
  try {
    const { suggestion } = req.params;
    // logger.info(suggestion, 'suggestion suggestion')

    const result = await getForumSuggestionService(suggestion);

    res.status(200).json({
      status: "success",
      message: "Get Forums suggestion Successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: "Couldn't get fourms suggestion",
      error: error.message,
    });
  }
};

module.exports.addUserForumActivity = async (req, res, next) => {
  try {
    // logger.info(req.body, "dataaaa")
    // const { id } = req.params
    const data = req.body;
    // logger.info(data, "dataaaa")
    const result = await addUserForumActivityServices(data);

    res.status(200).json({
      status: "success",
      message: "Successfully Added",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: "Doesn't add comment",
      error: error.message,
    });
  }
};

module.exports.getComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    // const data = (req.body)
    // logger.info(commentId, "commentIddddddd");
    const result = await getCommnetService(commentId);
    // logger.info(result, 'comments dataaa')

    res.status(200).json({
      status: "success",
      message: "Get Comment Successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: "Couldn't get Comment successfully",
      error: error.message,
    });
  }
};
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteCommentServices(id);

    if (!result.deletedCount) {
      return res.status(400).json({
        status: "fail",
        error: "Could't delete the Comment",
      });
    }
    res.status(200).json({
      status: "Success",
      message: "Comment Delete Successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "Fail",
      message: "Blog couldn't Delete Successfully",
      error: error.message,
    });
    logger.info(error, "error");
  }
};
