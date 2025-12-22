const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },

        slug: {
            type: String,
            unique: true,
            lowercase: true,
            index: true,
        },

        shortDescription: {
            type: String,
            required: true,
        },

        content: {
            type: String,
            required: true,
        },

        thumbnail: {
            type: String,
        },

        bannerImage: {
            type: String,
        },

        category: {
            type: String,
            required: true,
        },

        tags: [
            {
                type: String,
            },
        ],

        seoTitle: String,
        seoDescription: String,
        seoKeywords: [String],

        authorName: {
            type: String,
            default: "Admin",
        },

        readingTime: String,

        status: {
            type: String,
            enum: ["draft", "published", "archived"],
            default: "draft",
        },

        publishedAt: Date,

        views: {
            type: Number,
            default: 0,
        },

        likes: {
            type: Number,
            default: 0,
        },
        isFeatured: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// 🔹 Auto generate slug
blogSchema.pre("save", function (next) {
    if (!this.slug) {
        this.slug = this.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)+/g, "");
    }
    next();
});

module.exports = mongoose.model("Blog", blogSchema);
