import { Error as MongooseError } from 'mongoose';
import { HttpError } from '../utils/http-error.js';
import { isProduction } from '../config.js';

export function errorHandler(error, req, res, _next) {
    let statusCode = 500;
    let message = 'Internal server error';

    if (error instanceof HttpError) {
        statusCode = error.statusCode;
        message = error.message;
    }
    else if (error instanceof MongooseError.ValidationError) {
        statusCode = 400;
        message = Object.values(error.errors).map((entry) => entry.message).join(', ');
    }
    else if (error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'MongoServerError' &&
        'code' in error &&
        error.code === 11000) {
        statusCode = 409;
        const duplicateKey = error.keyPattern
            ? Object.keys(error.keyPattern)[0]
            : null;
        if (duplicateKey === 'email') {
            message = 'Email already exists';
        }
        else if (duplicateKey === 'phone') {
            message = 'Phone already exists';
        }
        else if (duplicateKey === 'licenseNumber') {
            message = 'License number already exists';
        }
        else {
            message = 'A record with the same unique field already exists';
        }
    }
    else if (error instanceof Error) {
        message = error.message || message;
    }

    console.error(`[${req.method}] ${req.url} - Status: ${statusCode}`, error);

    res.status(statusCode).json({
        success: false,
        statusCode,
        message,
        timestamp: new Date().toISOString(),
        path: req.url,
        stack: isProduction ? undefined : error.stack,
    });
}

