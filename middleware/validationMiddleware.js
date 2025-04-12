const { validationResult } = require("express-validator"); // Import validationResult

// Middleware to handle validation errors
exports.handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req); // Use validationResult here
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  next(); // Proceed to the next middleware or controller
};
