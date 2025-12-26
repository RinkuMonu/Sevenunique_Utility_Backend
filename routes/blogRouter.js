const express = require("express");
const router = express.Router();
const { createBlog, getAllBlogsAdmin, getBlogs, getBlogBySlug, updateBlog, deleteBlog } = require("../controllers/blogController");
const upload = require("../utils/uplods");


router.post(
    "/admin/blog",
    upload.fields([
        { name: "thumbnail", maxCount: 1 },
        { name: "bannerImage", maxCount: 1 },
    ]),
    createBlog
);

router.put(
    "/admin/blog/:id",
    upload.fields([
        { name: "thumbnail", maxCount: 1 },
        { name: "bannerImage", maxCount: 1 },
    ]),
    updateBlog
);

router.delete("/admin/blog/:id", deleteBlog);
router.get("/admin/blogs", getAllBlogsAdmin);

router.get("/blogs", getBlogs);
router.get("/blogs/:slug", getBlogBySlug);

module.exports = router;
