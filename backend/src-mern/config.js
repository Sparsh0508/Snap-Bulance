import dotenv from 'dotenv';
dotenv.config();
export const config = {
    environment: process.env.NODE_ENV || process.env.ENVIRONMENT || 'development',
    port: Number(process.env.PORT || 3000),
    mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/snapbulance',
    jwtSecret: process.env.JWT_SECRET || 'super_secret_snapbulance_key_change_in_prod',
    reactDevUrl: process.env.REACT_DEV_URL || 'http://localhost:5173',
    reactProdUrl: process.env.REACT_PROD_URL || '',
};
export const isProduction = config.environment === 'production';
function parseOrigins(value) {
    return String(value || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}
export function getAllowedOrigins() {
    return [...new Set([
            ...parseOrigins(config.reactDevUrl),
            ...parseOrigins(config.reactProdUrl),
        ])];
}
