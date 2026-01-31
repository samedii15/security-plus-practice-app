// Input validation middleware for API endpoints
// Provides early rejection of invalid payloads with clear error messages

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validation error class
export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = 400;
  }
}

// Validate email format
export function validateEmail(email) {
  if (!email) {
    throw new ValidationError('Email is required', 'email');
  }
  
  if (typeof email !== 'string') {
    throw new ValidationError('Email must be a string', 'email');
  }
  
  if (!EMAIL_REGEX.test(email)) {
    throw new ValidationError('Invalid email format', 'email');
  }
  
  return email.toLowerCase().trim();
}

// Validate password
export function validatePassword(password) {
  if (!password) {
    throw new ValidationError('Password is required', 'password');
  }
  
  if (typeof password !== 'string') {
    throw new ValidationError('Password must be a string', 'password');
  }
  
  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long', 'password');
  }
  
  return password;
}

// Validate registration payload
export function validateRegistration(req, res, next) {
  try {
    const { email, password } = req.body;
    
    req.body.email = validateEmail(email);
    req.body.password = validatePassword(password);
    
    next();
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ 
        error: err.message,
        field: err.field 
      });
    }
    next(err);
  }
}

// Validate login payload
export function validateLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    
    if (!email) {
      throw new ValidationError('Email is required', 'email');
    }
    
    if (!password) {
      throw new ValidationError('Password is required', 'password');
    }
    
    req.body.email = validateEmail(email);
    
    next();
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ 
        error: err.message,
        field: err.field 
      });
    }
    next(err);
  }
}

// Validate exam start payload
export function validateStartExam(req, res, next) {
  try {
    const { isRetakeMissed, customFilters } = req.body;
    
    // isRetakeMissed is optional, but if provided must be boolean
    if (isRetakeMissed !== undefined && typeof isRetakeMissed !== 'boolean') {
      throw new ValidationError('isRetakeMissed must be a boolean', 'isRetakeMissed');
    }
    
    // customFilters is optional, but if provided must be object
    if (customFilters !== undefined && typeof customFilters !== 'object') {
      throw new ValidationError('customFilters must be an object', 'customFilters');
    }
    
    next();
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ 
        error: err.message,
        field: err.field 
      });
    }
    next(err);
  }
}

// Validate exam submission payload
export function validateSubmitExam(req, res, next) {
  try {
    const { answers, timeUsed, attemptId } = req.body;
    
    if (!answers) {
      throw new ValidationError('Answers are required', 'answers');
    }
    
    if (typeof answers !== 'object') {
      throw new ValidationError('Answers must be an object', 'answers');
    }
    
    if (timeUsed !== undefined && (typeof timeUsed !== 'number' || timeUsed < 0)) {
      throw new ValidationError('timeUsed must be a positive number', 'timeUsed');
    }
    
    if (!attemptId) {
      throw new ValidationError('attemptId is required', 'attemptId');
    }
    
    if (typeof attemptId !== 'number' || attemptId <= 0) {
      throw new ValidationError('attemptId must be a positive number', 'attemptId');
    }
    
    next();
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ 
        error: err.message,
        field: err.field 
      });
    }
    next(err);
  }
}

// Validate study session start payload
export function validateStartStudy(req, res, next) {
  try {
    const { filters, questionCount, immediateMode } = req.body;
    
    // filters is optional, but if provided must be object
    if (filters !== undefined && typeof filters !== 'object') {
      throw new ValidationError('filters must be an object', 'filters');
    }
    
    // questionCount is optional, but if provided must be positive number
    if (questionCount !== undefined && (typeof questionCount !== 'number' || questionCount <= 0 || questionCount > 1000)) {
      throw new ValidationError('questionCount must be a positive number between 1 and 1000', 'questionCount');
    }
    
    // immediateMode is optional, but if provided must be boolean
    if (immediateMode !== undefined && typeof immediateMode !== 'boolean') {
      throw new ValidationError('immediateMode must be a boolean', 'immediateMode');
    }
    
    next();
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ 
        error: err.message,
        field: err.field 
      });
    }
    next(err);
  }
}

// Validate admin delete user payload
export function validateDeleteUser(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId) || userId <= 0) {
      throw new ValidationError('Invalid user ID', 'userId');
    }
    
    req.params.userId = userId;
    
    next();
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ 
        error: err.message,
        field: err.field 
      });
    }
    next(err);
  }
}

// Validate numeric ID parameter
export function validateIdParam(paramName = 'id') {
  return (req, res, next) => {
    try {
      const id = parseInt(req.params[paramName]);
      
      if (isNaN(id) || id <= 0) {
        throw new ValidationError(`Invalid ${paramName}`, paramName);
      }
      
      req.params[paramName] = id;
      
      next();
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ 
          error: err.message,
          field: err.field 
        });
      }
      next(err);
    }
  };
}

// Generic validation error handler (use at end of middleware chain)
export function validationErrorHandler(err, req, res, next) {
  if (err instanceof ValidationError) {
    return res.status(err.statusCode).json({
      error: err.message,
      field: err.field
    });
  }
  
  next(err);
}
