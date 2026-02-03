const zod = require('zod');
const { z } = zod;
const mongoose = require('mongoose');
const { categoryValues } = require('./forum.constant');




const forumUserActivitiesValidationSchema = z.object({
    body: z.object({
        title: z.string().min(3).max(100),
        img: z.string().refine(value => value.trim() !== '', { message: 'Forum image is required' }),
        category: z.string().refine(value => categoryValues.includes(value), {
            message: 'Invalid category',
        }),
        author: z.string().uuid({ message: 'Invalid author ID' }).refine(value => value.trim() !== '', { message: 'Author ID is required' }),
        authorEmail: z.string().email('Please provide a valid email'),
        description: z.array(z.object({
            title: z.string(),
            content1: z.string(),
            content2: z.string(),
        })),
        // userActivities: z.array(z.string().uuid().refine((value) => mongoose.Types.ObjectId.isValid(value), {
        //     message: 'Invalid user activity ID',
        // })),
        createdAt: z.date().default(() => new Date()),
        updatedAt: z.date().default(() => new Date()),
    }).refine(data => data.createdAt <= data.updatedAt, {
        message: 'updatedAt must be greater than or equal to createdAt',
    })
});

module.exports = forumUserActivitiesValidationSchema;
