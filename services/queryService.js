const nodemailer = require("nodemailer");
require("dotenv").config();

const sendEmail = async ({ fullName, email, number, message }) => {
  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  let mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.WEBSITE_EMAIL,
    subject: "New Form Submission",
    text: `Name: ${fullName}\nEmail: ${email}\nPhone: ${number}\nMessage: ${message || "No message provided"}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    //console.log("Email sent successfully!");
  } catch (error) {
    console.error("Error sending email:",error);
  }
};

module.exports = sendEmail;
