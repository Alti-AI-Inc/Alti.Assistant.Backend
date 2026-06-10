import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let Admin; // The Mongoose model
let mongoServer;

// Setup in-memory MongoDB before all tests
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    // Dynamically import the model after mongoose is connected
    // This ensures the model uses the connected mongoose instance
    // The path is relative to the test file.
    // Assuming the test file is in the same directory as admin.model.js
    Admin = require('./admin.model');
});

// Teardown in-memory MongoDB after all tests
afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

// Clear the database before each test to ensure isolation
beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
});

describe('Admin Model', () => {
    // Test Case 1: Basic creation with required fields
    it('should create a new admin successfully with minimum required fields', async () => {
        const adminData = {
            username: 'testuser',
            email: 'test@example.com',
            password: 'securepassword123'
        };
        const admin = new Admin(adminData);
        await admin.save();

        expect(admin._id).toBeDefined();
        expect(admin.username).toBe(adminData.username);
        expect(admin.email).toBe(adminData.email);
        expect(admin.password).toBe(adminData.password);
        expect(admin.roles).toEqual(['admin']); // Default role
        expect(admin.isActive).toBe(true); // Default isActive
        expect(admin.createdAt).toBeInstanceOf(Date);
        expect(admin.updatedAt).toBeInstanceOf(Date);
    });

    // Test Case 2: Creation with all fields
    it('should create a new admin successfully with all fields provided', async () => {
        const adminData = {
            username: 'fulluser',
            email: 'full@example.com',
            password: 'anothersecurepassword',
            firstName: 'John',
            lastName: 'Doe',
            roles: ['superadmin', 'editor'],
            isActive: false
        };
        const admin = new Admin(adminData);
        await admin.save();

        expect(admin._id).toBeDefined();
        expect(admin.username).toBe(adminData.username);
        expect(admin.email).toBe(adminData.email);
        expect(admin.password).toBe(adminData.password);
        expect(admin.firstName).toBe(adminData.firstName);
        expect(admin.lastName).toBe(adminData.lastName);
        expect(admin.roles).toEqual(adminData.roles);
        expect(admin.isActive).toBe(adminData.isActive);
        expect(admin.createdAt).toBeInstanceOf(Date);
        expect(admin.updatedAt).toBeInstanceOf(Date);
    });

    // Test Case 3: Required field validation - username
    it('should fail to create an admin without a username', async () => {
        const adminData = {
            email: 'no_username@example.com',
            password: 'password123'
        };
        const admin = new Admin(adminData);
        await expect(admin.save()).rejects.toThrow(mongoose.Error.ValidationError);
        await expect(admin.save()).rejects.toThrow(/Path `username` is required/);
    });

    // Test Case 4: Required field validation - email
    it('should fail to create an admin without an email', async () => {
        const adminData = {
            username: 'no_email',
            password: 'password123'
        };
        const admin = new Admin(adminData);
        await expect(admin.save()).rejects.toThrow(mongoose.Error.ValidationError);
        await expect(admin.save()).rejects.toThrow(/Path `email` is required/);
    });

    // Test Case 5: Required field validation - password
    it('should fail to create an admin without a password', async () => {
        const adminData = {
            username: 'no_password',
            email: 'no_password@example.com'
        };
        const admin = new Admin(adminData);
        await expect(admin.save()).rejects.toThrow(mongoose.Error.ValidationError);
        await expect(admin.save()).rejects.toThrow(/Path `password` is required/);
    });

    // Test Case 6: Unique field validation - username
    it('should fail to create an admin with a duplicate username', async () => {
        const adminData = {
            username: 'duplicateuser',
            email: 'first@example.com',
            password: 'password123'
        };
        await new Admin(adminData).save();

        const duplicateAdminData = {
            username: 'duplicateuser', // Same username
            email: 'second@example.com',
            password: 'password456'
        };
        const duplicateAdmin = new Admin(duplicateAdminData);
        await expect(duplicateAdmin.save()).rejects.toThrow(mongoose.Error.MongoServerError);
        await expect(duplicateAdmin.save()).rejects.toThrow(/duplicate key error/);
    });

    // Test Case 7: Unique field validation - email
    it('should fail to create an admin with a duplicate email', async () => {
        const adminData = {
            username: 'user1',
            email: 'duplicate@example.com',
            password: 'password123'
        };
        await new Admin(adminData).save();

        const duplicateAdminData = {
            username: 'user2',
            email: 'duplicate@example.com', // Same email
            password: 'password456'
        };
        const duplicateAdmin = new Admin(duplicateAdminData);
        await expect(duplicateAdmin.save()).rejects.toThrow(mongoose.Error.MongoServerError);
        await expect(duplicateAdmin.save()).rejects.toThrow(/duplicate key error/);
    });

    // Test Case 8: Email format validation
    it('should fail to create an admin with an invalid email format', async () => {
        const adminData = {
            username: 'invalidemail',
            email: 'invalid-email', // Invalid format
            password: 'password123'
        };
        const admin = new Admin(adminData);
        await expect(admin.save()).rejects.toThrow(mongoose.Error.ValidationError);
        await expect(admin.save()).rejects.toThrow(/Please fill a valid email address/);
    });

    // Test Case 9: Email should be lowercase
    it('should convert email to lowercase before saving', async () => {
        const adminData = {
            username: 'caseuser',
            email: 'TEST@EXAMPLE.COM',
            password: 'password123'
        };
        const admin = new Admin(adminData);
        await admin.save();
        expect(admin.email).toBe('test@example.com');
    });

    // Test Case 10: Roles enum validation
    it('should fail to create an admin with an invalid role', async () => {
        const adminData = {
            username: 'badrole',
            email: 'badrole@example.com',
            password: 'password123',
            roles: ['invalid_role'] // Not in enum
        };
        const admin = new Admin(adminData);
        await expect(admin.save()).rejects.toThrow(mongoose.Error.ValidationError);
        await expect(admin.save()).rejects.toThrow(/`invalid_role` is not a valid enum value for path `roles`/);
    });

    // Test Case 11: Trim functionality
    it('should trim whitespace from string fields', async () => {
        const adminData = {
            username: '  trimmeduser  ',
            email: '  trimmed@example.com  ',
            password: 'password123',
            firstName: '  First  ',
            lastName: '  Last  '
        };
        const admin = new Admin(adminData);
        await admin.save();

        expect(admin.username).toBe('trimmeduser');
        expect(admin.email).toBe('trimmed@example.com'); // lowercase also applies
        expect(admin.firstName).toBe('First');
        expect(admin.lastName).toBe('Last');
    });

    // Test Case 12: Timestamps update on modification
    it('should update `updatedAt` field when an admin is modified', async () => {
        const adminData = {
            username: 'updatetest',
            email: 'update@example.com',
            password: 'password123'
        };
        const admin = new Admin(adminData);
        await admin.save();

        const initialUpdatedAt = admin.updatedAt;
        // Simulate a small delay to ensure updatedAt changes
        await new Promise(resolve => setTimeout(resolve, 10));

        admin.firstName = 'Updated';
        await admin.save();

        expect(admin.updatedAt).toBeInstanceOf(Date);
        expect(admin.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
    });

    // Test Case 13: Find an admin
    it('should find an admin by username', async () => {
        const adminData = {
            username: 'findme',
            email: 'findme@example.com',
            password: 'password123'
        };
        await new Admin(adminData).save();

        const foundAdmin = await Admin.findOne({ username: 'findme' });
        expect(foundAdmin).toBeDefined();
        expect(foundAdmin.username).toBe(adminData.username);
    });

    // Test Case 14: Delete an admin
    it('should delete an admin', async () => {
        const adminData = {
            username: 'deleteme',
            email: 'deleteme@example.com',
            password: 'password123'
        };
        const admin = await new Admin(adminData).save();

        await Admin.deleteOne({ _id: admin._id });
        const deletedAdmin = await Admin.findById(admin._id);
        expect(deletedAdmin).toBeNull();
    });
});