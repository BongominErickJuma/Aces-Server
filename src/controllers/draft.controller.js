const Draft = require('../models/Draft.model');
const ApiResponse = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler.middleware');

// GET /api/drafts/:type - Get draft for specific form type
const getDraftByType = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const validTypes = ['quotation-create', 'receipt-create'];

  if (!validTypes.includes(type)) {
    return ApiResponse.badRequest(res, 'Invalid draft type');
  }

  const draft = await Draft.findOne({
    userId: req.user._id,
    type
  });

  if (!draft) {
    return ApiResponse.success(res, null, 'No draft found');
  }

  ApiResponse.success(res, draft, 'Draft retrieved successfully');
});

// POST /api/drafts - Save or update draft
const saveDraft = asyncHandler(async (req, res) => {
  const { type, data } = req.body;
  const validTypes = ['quotation-create', 'receipt-create'];

  if (!validTypes.includes(type)) {
    return ApiResponse.badRequest(res, 'Invalid draft type');
  }

  if (!data || typeof data !== 'object') {
    return ApiResponse.badRequest(res, 'Invalid draft data');
  }

  // Find existing draft or create new one
  let draft = await Draft.findOne({
    userId: req.user._id,
    type
  });

  if (draft) {
    // Update existing draft
    draft.data = data;
    draft.lastModified = new Date();
    await draft.save();
  } else {
    // Create new draft
    draft = new Draft({
      userId: req.user._id,
      type,
      data,
      title: data.client?.name ? `Draft for ${data.client.name}` : 'Untitled Draft'
    });
    await draft.save();
  }

  ApiResponse.success(res, draft, 'Draft saved successfully');
});

// DELETE /api/drafts/:type - Delete draft by type
const deleteDraftByType = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const validTypes = ['quotation-create', 'receipt-create'];

  if (!validTypes.includes(type)) {
    return ApiResponse.badRequest(res, 'Invalid draft type');
  }

  const draft = await Draft.findOneAndDelete({
    userId: req.user._id,
    type
  });

  if (!draft) {
    return ApiResponse.notFound(res, 'Draft not found');
  }

  ApiResponse.success(res, {}, 'Draft deleted successfully');
});

// GET /api/drafts - Get all drafts for user
const getUserDrafts = asyncHandler(async (req, res) => {
  const drafts = await Draft.find({
    userId: req.user._id
  })
  .select('type title lastModified createdAt')
  .sort({ lastModified: -1 });

  ApiResponse.success(res, drafts, 'Drafts retrieved successfully');
});

// DELETE /api/drafts - Delete all drafts for user
const deleteAllUserDrafts = asyncHandler(async (req, res) => {
  const result = await Draft.deleteMany({
    userId: req.user._id
  });

  ApiResponse.success(res, {
    deletedCount: result.deletedCount
  }, 'All drafts deleted successfully');
});

module.exports = {
  getDraftByType,
  saveDraft,
  deleteDraftByType,
  getUserDrafts,
  deleteAllUserDrafts
};