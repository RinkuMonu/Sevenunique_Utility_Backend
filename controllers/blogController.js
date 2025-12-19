const Blog = require("../models/blog.model");



exports.createBlog = async (req, res) => {
    try {
        const {
            title,
            shortDescription,
            content,
            category,
            tags,
            seoTitle,
            seoDescription,
            seoKeywords,
            status,
            isFeatured,
        } = req.body;

        const blog = await Blog.create({
            title,
            shortDescription,
            content,
            category,
            tags,
            seoTitle,
            seoDescription,
            seoKeywords,
            status,
            isFeatured,
            thumbnail: req.files?.thumbnail
                ? `/uploads/${req.files.thumbnail[0].filename}`
                : null,
            bannerImage: req.files?.bannerImage
                ? `/uploads/${req.files.bannerImage[0].filename}`
                : null,
            publishedAt: status === "published" ? new Date() : null,
        });

        res.status(201).json({
            success: true,
            message: "Blog created successfully",
            data: blog,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.updateBlog = async (req, res) => {
    try {
        const updateData = { ...req.body };

        if (req.files?.thumbnail) {
            updateData.thumbnail = `/uploads/${req.files.thumbnail[0].filename}`;
        }

        if (req.files?.bannerImage) {
            updateData.bannerImage = `/uploads/${req.files.bannerImage[0].filename}`;
        }

        if (updateData.status === "published") {
            updateData.publishedAt = new Date();
        }

        const blog = await Blog.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!blog) {
            return res.status(404).json({
                success: false,
                message: "Blog not found",
            });
        }

        res.json({
            success: true,
            message: "Blog updated successfully",
            data: blog,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.deleteBlog = async (req, res) => {
    try {
        const blog = await Blog.findByIdAndDelete(req.params.id);
        if (!blog) {
            return res.status(404).json({
                success: false,
                message: "Blog not found",
            });
        }

        res.json({
            success: true,
            message: "Blog deleted successfully",
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.getAllBlogsAdmin = async (req, res) => {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.json({ success: true, data: blogs });
};


exports.getBlogs = async (req, res) => {
    const { category } = req.query;

    const filter = { status: "published" };
    if (category) filter.category = category;

    const blogs = await Blog.find(filter)
        .sort({ publishedAt: -1 })
        .select("-content");

    res.json({ success: true, data: blogs });
};


exports.getBlogBySlug = async (req, res) => {
    const blog = await Blog.findOne({
        slug: req.params.slug,
        status: "published",
    });

    if (!blog) {
        return res.status(404).json({
            success: false,
            message: "Blog not found",
        });
    }

    // 🔥 increase views
    blog.views += 1;
    await blog.save();

    res.json({ success: true, data: blog });
};
