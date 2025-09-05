import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';
import { AppError } from './errorHandler';

export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error: ValidationError) => ({
      field: error.type === 'field' ? error.path : undefined,
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined
    }));
    
    const error = new AppError(
      `Validation failed: ${errorMessages.map(e => e.message).join(', ')}`,
      400
    );
    
    // Attach validation details
    (error as any).validationErrors = errorMessages;
    
    return next(error);
  }
  
  next();
};

// Export as module
export default validateRequest;