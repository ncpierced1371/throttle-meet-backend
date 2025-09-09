export function errorHandler(err: any, req: any, res: any, next?: any) {
	if (res && typeof res.status === 'function') {
		res.status(err.statusCode || 500).json({ error: err.message || 'Unknown error' });
	} else if (typeof req.send === 'function') {
		req.send({ error: err.message || 'Unknown error' });
	}
}

export class AppError extends Error {
	statusCode: number;
	constructor(message: string, statusCode: number = 500) {
		super(message);
		this.statusCode = statusCode;
		Object.setPrototypeOf(this, AppError.prototype);
	}
}

export function asyncHandler(fn: Function) {
	return function (req: any, res: any, next: any) {
		Promise.resolve(fn(req, res, next)).catch(next);
	};
}