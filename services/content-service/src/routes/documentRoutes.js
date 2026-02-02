const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { requireAuth, requireAdmin } = require('../middlewares/authMiddleware');

router.use(requireAuth);
router.post('/upload', requireAdmin, documentController.uploadDocument.bind(documentController));
router.get('/', documentController.listDocuments.bind(documentController));
router.get('/:id/status', documentController.getDocumentStatus.bind(documentController));
router.delete('/:id', requireAdmin, documentController.deleteDocument.bind(documentController));
router.post('/webhook/s3-uploaded', documentController.s3UploadedCallback.bind(documentController));

module.exports = router;
