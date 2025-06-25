
const mongoose = require("mongoose");
// const validator = require("validator");


const forumUserActivitiesSchema = mongoose.Schema(
    {
        id: {
            type: String,
        },
        img: {
            type: String,
        },
        email: {
            type: String,
            // validate: [validator.isEmail, "Please provide a valid email"],
            // unique: false
        },
        like: {
            type: Boolean,
            default: false
        },
        likeCount: {
            type: Number
        },
        comment: {
            type: String,
            required: [true, "Please provide a comment"],
            minLength: [3, "Comment must be at list 3 characters"],
            maxLength: [200, "Comment is too learge"],
        },
        userActivities: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Forum'
            }
        ],
        createdAt: {
            type: Date,
            default: Date.now,
        },
        updatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

const UserForumActivities = mongoose.model("forum-User-Activities", forumUserActivitiesSchema);


module.exports = UserForumActivities;