import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Workspace from './workspace.model.js';

// Helper to create a new ObjectId for testing
const createObjectId = () => new mongoose.Types.ObjectId();

describe('Workspace Model', () => {
    let ownerId;
    let memberId;
    let adminId;
    let managerId;

    beforeEach(() => {
        ownerId = createObjectId();
        memberId = createObjectId();
        adminId = createObjectId();
        managerId = createObjectId();
    });

    describe('Schema and Validation', () => {
        it('should create a valid workspace with all required fields', () => {
            const workspaceData = {
                name: 'Test Workspace',
                owner: ownerId,
                members: [{ user: ownerId, role: 'owner' }],
            };
            const workspace = new Workspace(workspaceData);
            const error = workspace.validateSync();
            expect(error).toBeUndefined();
            expect(workspace.name).toBe('Test Workspace');
            expect(workspace.owner).toEqual(ownerId);
            expect(workspace.members.length).toBe(1);
            expect(workspace.members[0].user).toEqual(ownerId);
            expect(workspace.members[0].role).toBe('owner');
        });

        it('should apply default values on creation', () => {
            const workspace = new Workspace({
                name: 'Default Workspace',
                owner: ownerId,
                members: [{ user: ownerId, role: 'owner' }],
            });
            expect(workspace.plan.type).toBe('free');
            expect(workspace.plan.memberLimit).toBe(5);
            expect(workspace.metrics.apiCalls).toBe(0);
            expect(workspace.metrics.projectsCount).toBe(0);
            expect(workspace.metrics.storageUsedMB).toBe(0);
            expect(workspace.settings.timezone).toBe('UTC');
            expect(workspace.invitations).toEqual([]);
        });

        it('should fail validation if name is missing', () => {
            const workspace = new Workspace({
                owner: ownerId,
                members: [{ user: ownerId, role: 'owner' }],
            });
            const error = workspace.validateSync();
            expect(error.errors.name).toBeDefined();
            expect(error.errors.name.message).toBe('Workspace name is required.');
        });

        it('should fail validation if owner is missing', () => {
            const workspace = new Workspace({
                name: 'No Owner Workspace',
                members: [{ user: ownerId, role: 'owner' }],
            });
            const error = workspace.validateSync();
            expect(error.errors.owner).toBeDefined();
        });

        it('should fail validation if the owner is not in the members list', () => {
            const workspace = new Workspace({
                name: 'Missing Owner Member',
                owner: ownerId,
                members: [{ user: memberId, role: 'member' }],
            });
            const error = workspace.validateSync();
            expect(error.errors.members).toBeDefined();
            expect(error.errors.members.message).toBe('The workspace owner must be included in the members list with the owner role.');
        });

        it('should fail validation if the owner is in members list but not with "owner" role', () => {
            const workspace = new Workspace({
                name: 'Wrong Role for Owner',
                owner: ownerId,
                members: [{ user: ownerId, role: 'admin' }],
            });
            const error = workspace.validateSync();
            expect(error.errors.members).toBeDefined();
            expect(error.errors.members.message).toBe('The workspace owner must be included in the members list with the owner role.');
        });

        it('should fail validation for an invalid member role', () => {
            const workspace = new Workspace({
                name: 'Invalid Role',
                owner: ownerId,
                members: [
                    { user: ownerId, role: 'owner' },
                    { user: memberId, role: 'guest' } // Invalid role
                ],
            });
            const error = workspace.validateSync();
            expect(error.errors['members.1.role']).toBeDefined();
        });

        it('should fail validation for an invalid invitation role (e.g., "owner")', () => {
            const workspace = new Workspace({
                name: 'Invalid Invite Role',
                owner: ownerId,
                members: [{ user: ownerId, role: 'owner' }],
                invitations: [{
                    email: 'test@example.com',
                    role: 'owner', // Invalid role for an invitation
                    token: 'sometoken',
                    invitedBy: ownerId,
                    expiresAt: new Date(Date.now() + 100000),
                }]
            });
            const error = workspace.validateSync();
            expect(error.errors['invitations.0.role']).toBeDefined();
        });

        it('should fail validation for an invalid plan type', () => {
            const workspace = new Workspace({
                name: 'Invalid Plan',
                owner: ownerId,
                members: [{ user: ownerId, role: 'owner' }],
                plan: { type: 'ultimate' } // Invalid plan type
            });
            const error = workspace.validateSync();
            expect(error.errors['plan.type']).toBeDefined();
        });
    });

    describe('Virtuals', () => {
        it('should correctly calculate memberCount', () => {
            const workspace = new Workspace({
                name: 'Count Workspace',
                owner: ownerId,
                members: [
                    { user: ownerId, role: 'owner' },
                    { user: adminId, role: 'admin' },
                    { user: memberId, role: 'member' },
                ],
            });
            expect(workspace.memberCount).toBe(3);
        });

        it('should have memberCount of 1 for a new workspace with only an owner', () => {
            const workspace = new Workspace({
                name: 'New Workspace',
                owner: ownerId,
                members: [{ user: ownerId, role: 'owner' }],
            });
            expect(workspace.memberCount).toBe(1);
        });
    });

    describe('Instance Methods', () => {
        let workspace;

        beforeEach(() => {
            workspace = new Workspace({
                name: 'Methods Workspace',
                owner: ownerId,
                members: [
                    { user: ownerId, role: 'owner' },
                    { user: adminId, role: 'admin' },
                    { user: managerId, role: 'manager' },
                    { user: memberId, role: 'member' },
                ],
                invitations: [{
                    email: 'pending@example.com',
                    role: 'member',
                    token: 'pendingtoken',
                    invitedBy: ownerId,
                    expiresAt: new Date(Date.now() + 100000),
                }],
                plan: {
                    type: 'starter',
                    memberLimit: 5,
                },
            });
        });

        describe('isMember()', () => {
            it('should return true for an existing member', () => {
                expect(workspace.isMember(memberId)).toBe(true);
            });

            it('should return true for the owner', () => {
                expect(workspace.isMember(ownerId)).toBe(true);
            });

            it('should return false for a non-member', () => {
                const nonMemberId = createObjectId();
                expect(workspace.isMember(nonMemberId)).toBe(false);
            });

            it('should handle string and ObjectId inputs interchangeably', () => {
                expect(workspace.isMember(memberId.toString())).toBe(true);
            });
        });

        describe('getMemberRole()', () => {
            it('should return the correct role for the owner', () => {
                expect(workspace.getMemberRole(ownerId)).toBe('owner');
            });

            it('should return the correct role for an admin', () => {
                expect(workspace.getMemberRole(adminId)).toBe('admin');
            });

            it('should return the correct role for a manager', () => {
                expect(workspace.getMemberRole(managerId)).toBe('manager');
            });

            it('should return the correct role for a regular member', () => {
                expect(workspace.getMemberRole(memberId)).toBe('member');
            });

            it('should return null for a non-member', () => {
                const nonMemberId = createObjectId();
                expect(workspace.getMemberRole(nonMemberId)).toBe(null);
            });

            it('should handle string and ObjectId inputs interchangeably', () => {
                expect(workspace.getMemberRole(adminId.toString())).toBe('admin');
            });
        });

        describe('isAtMemberLimit()', () => {
            it('should return false when potential members are below the limit', () => {
                // 4 members + 1 invitation = 5 potential members.
                workspace.plan.memberLimit = 6;
                expect(workspace.isAtMemberLimit()).toBe(false);
            });

            it('should return true when potential members are equal to the limit', () => {
                // 4 members + 1 invitation = 5 potential members. Limit is 5.
                expect(workspace.isAtMemberLimit()).toBe(true);
            });

            it('should return true when potential members exceed the limit', () => {
                // 4 members + 1 invitation = 5 potential members.
                workspace.plan.memberLimit = 4;
                expect(workspace.isAtMemberLimit()).toBe(true);
            });

            it('should correctly calculate with only members and no invitations', () => {
                workspace.invitations = []; // 4 members
                workspace.plan.memberLimit = 5;
                expect(workspace.isAtMemberLimit()).toBe(false);

                workspace.plan.memberLimit = 4;
                expect(workspace.isAtMemberLimit()).toBe(true);
            });

            it('should correctly calculate with only invitations and the owner', () => {
                workspace.members = [{ user: ownerId, role: 'owner' }]; // 1 member
                workspace.invitations = [
                    { email: 'a@a.com', token: 'a', invitedBy: ownerId, expiresAt: new Date() },
                    { email: 'b@b.com', token: 'b', invitedBy: ownerId, expiresAt: new Date() },
                    { email: 'c@c.com', token: 'c', invitedBy: ownerId, expiresAt: new Date() },
                    { email: 'd@d.com', token: 'd', invitedBy: ownerId, expiresAt: new Date() },
                ]; // 4 invitations
                // Total potential = 1 + 4 = 5
                workspace.plan.memberLimit = 5;
                expect(workspace.isAtMemberLimit()).toBe(true);

                workspace.plan.memberLimit = 6;
                expect(workspace.isAtMemberLimit()).toBe(false);
            });
        });
    });

    describe('Role-Based Access and Context Boundaries', () => {
        it('should correctly store and retrieve different user roles, forming the basis for RBAC', () => {
            const workspace = new Workspace({
                name: 'RBAC Workspace',
                owner: ownerId,
                members: [
                    { user: ownerId, role: 'owner' },
                    { user: adminId, role: 'admin' },
                    { user: managerId, role: 'manager' },
                    { user: memberId, role: 'member' },
                ],
            });

            expect(workspace.getMemberRole(ownerId)).toBe('owner');
            expect(workspace.getMemberRole(adminId)).toBe('admin');
            expect(workspace.getMemberRole(managerId)).toBe('manager');
            expect(workspace.getMemberRole(memberId)).toBe('member');
            expect(workspace.getMemberRole(createObjectId())).toBeNull();
        });

        it('should enforce context boundary by disallowing "owner" role in invitations via schema validation', () => {
             const workspace = new Workspace({
                name: 'Invalid Invite Role',
                owner: ownerId,
                members: [{ user: ownerId, role: 'owner' }],
                invitations: [{
                    email: 'test@example.com',
                    role: 'owner',
                    token: 'sometoken',
                    invitedBy: ownerId,
                    expiresAt: new Date(Date.now() + 100000),
                }]
            });
            const error = workspace.validateSync();
            expect(error.errors['invitations.0.role']).toBeDefined();
            expect(error.errors['invitations.0.role'].message).toContain('`owner` is not a valid enum value');
        });
    });
});