const successResponse = (data, message = 'Success') => ({
  status: 'success',
  message,
  data,
  timestamp: new Date().toISOString()
});

const errorResponse = (errorCode, message, details = {}) => ({
  status: 'error',
  error_code: errorCode,
  message,
  details,
  timestamp: new Date().toISOString()
});

module.exports = {
  successResponse,
  errorResponse
};
