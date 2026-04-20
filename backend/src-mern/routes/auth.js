import argon2 from 'argon2';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config, isProduction } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { AmbulanceModel } from '../models/ambulance.js';
import { CfrProfileModel } from '../models/cfr-profile.js';
import { DriverProfileModel } from '../models/driver-profile.js';
import { HospitalModel } from '../models/hospital.js';
import { HospitalProfileModel } from '../models/hospital-profile.js';
import { UserModel } from '../models/user.js';
import { asyncHandler } from '../utils/async-handler.js';
import { HttpError } from '../utils/http-error.js';
import { toSafeUser } from '../utils/presenters.js';
export const authRouter = Router();
function signToken(userId, email, role) {
    return jwt.sign({ sub: userId, email, role }, config.jwtSecret, { expiresIn: '1d' });
}
function setAuthCookie(res, token) {
    res.cookie('access_token', token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
    });
}
authRouter.get('/', asyncHandler(async (req, res) => {
    const token = req.cookies?.access_token;
    if (!token) {
        res.json({ isAuth: false, user: null });
        return;
    }

    try {
        const payload = jwt.verify(token, config.jwtSecret);
        const user = await UserModel.findById(payload.sub);
        if (!user) {
            res.json({ isAuth: false, user: null });
            return;
        }

        res.json({ isAuth: true, user: toSafeUser(user) });
    }
    catch {
        res.json({ isAuth: false, user: null });
    }
}));
authRouter.post('/signup', asyncHandler(async (req, res) => {
    const { email, phone, fullName, passwordHash, role = 'USER' } = req.body;
    if (!email || !phone || !fullName || !passwordHash) {
        throw new HttpError(400, 'fullName, email, phone, and passwordHash are required');
    }
    const normalizedEmail = email.toLowerCase().trim();
    const [existingEmailUser, existingPhoneUser] = await Promise.all([
        UserModel.findOne({ email: normalizedEmail }),
        UserModel.findOne({ phone }),
    ]);
    if (existingEmailUser) {
        throw new HttpError(409, 'Email already exists');
    }
    if (existingPhoneUser) {
        throw new HttpError(409, 'Phone already exists');
    }
    const hashedPassword = await argon2.hash(passwordHash);
    const user = await UserModel.create({
        email: normalizedEmail,
        phone,
        fullName,
        passwordHash: hashedPassword,
        role,
    });
    if (role === 'DRIVER') {
        const ambulance = await AmbulanceModel.create({
            plateNumber: `PENDING-AB-${Date.now()}`,
            type: 'BLS',
            model: 'Pending Vehicle',
            equipmentList: ['Basic First Aid'],
        });
        await DriverProfileModel.create({
            userId: user.id,
            licenseNumber: `PENDING-DL-${Date.now()}`,
            yearsExperience: 0,
            status: 'AVAILABLE',
            currentLat: 19.1973,
            currentLng: 72.9644,
            ambulanceId: ambulance.id,
        });
    }
    else if (role === 'CFR') {
        await CfrProfileModel.create({
            userId: user.id,
            certificationId: `PENDING-CFR-${Date.now()}`,
            isVerified: true,
        });
    }
    else if (role === 'HOSPITAL_ADMIN') {
        const hospital = await HospitalModel.create({
            name: `Pending Hospital ${Date.now()}`,
            address: 'Thane Area, Default',
            latitude: 19.2064,
            longitude: 72.9744,
            phone,
            availableBeds: 5,
            icuAvailable: 1,
            ventilators: 1,
            specialties: ['General'],
        });
        await HospitalProfileModel.create({
            userId: user.id,
            hospitalId: hospital.id,
        });
    }
    const token = signToken(user.id, user.email, user.role);
    setAuthCookie(res, token);
    res.json({
        message: 'Welcome to SnapBulance!',
        user: toSafeUser(user),
    });
}));
authRouter.post('/login', asyncHandler(async (req, res) => {
    const { email, passwordHash } = req.body;
    if (!email || !passwordHash) {
        throw new HttpError(400, 'email and passwordHash are required');
    }
    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
        throw new HttpError(404, 'User not found');
    }
    const passwordValid = await argon2.verify(user.passwordHash, passwordHash);
    if (!passwordValid) {
        throw new HttpError(401, 'Invalid credentials');
    }
    const token = signToken(user.id, user.email, user.role);
    setAuthCookie(res, token);
    res.json({
        message: 'Login successful',
        user: toSafeUser(user),
    });
}));
authRouter.post('/logout', requireAuth, asyncHandler(async (_req, res) => {
    res.clearCookie('access_token', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
    });
    res.json({ message: 'Logged out successfully' });
}));
authRouter.get('/profile', requireAuth, asyncHandler(async (req, res) => {
    const authUser = req.user;
    const user = await UserModel.findById(authUser?.id);
    if (!user) {
        throw new HttpError(404, 'User not found');
    }
    res.json(toSafeUser(user));
}));
