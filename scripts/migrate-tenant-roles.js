import mongoose from 'mongoose';
import dotenv from 'dotenv';
import UserModel from '../src/app/modules/auth/auth.model.js';
import TenantMember from '../src/app/modules/tenant/tenantMember.model.js';
import TenantInvitation from '../src/app/modules/tenant/tenantInvitation.model.js';
import config from '../config/index.js';
import { logger } from '../src/shared/logger.js';

// Load environment variables
dotenv.config();

async function migrateTenantRoles() {
  logger.info('========================================');
  logger.info('Tenant Roles Database Migration Script');
  logger.info('========================================\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(config.database_local);
    logger.info('✅ Connected to MongoDB\n');

    // 1. Migrate TenantMembers
    logger.info('🔄 Migrating TenantMember collection...');
    
    // We update 'owner' -> 'admin' (Admin UI role)
    const ownerRes = await TenantMember.updateMany(
      { role: 'owner' },
      { $set: { role: 'admin', permissions: ['*'] } }
    );
    logger.info(`   - Updated 'owner' to 'admin': ${ownerRes.modifiedCount} records`);

    // We update 'admin' -> 'manager' (Manager UI role)
    const adminRes = await TenantMember.updateMany(
      { role: 'admin' },
      { $set: { role: 'manager' } }
    );
    logger.info(`   - Updated 'admin' to 'manager': ${adminRes.modifiedCount} records`);

    // We update 'member' -> 'user' (User UI role)
    const memberRes = await TenantMember.updateMany(
      { role: 'member' },
      { $set: { role: 'user' } }
    );
    logger.info(`   - Updated 'member' to 'user': ${memberRes.modifiedCount} records\n`);


    // 2. Migrate TenantInvitations
    logger.info('🔄 Migrating TenantInvitation collection...');

    const inviteAdminRes = await TenantInvitation.updateMany(
      { role: 'admin' },
      { $set: { role: 'manager' } }
    );
    logger.info(`   - Updated 'admin' to 'manager': ${inviteAdminRes.modifiedCount} records`);

    const inviteMemberRes = await TenantInvitation.updateMany(
      { role: 'member' },
      { $set: { role: 'user' } }
    );
    logger.info(`   - Updated 'member' to 'user': ${inviteMemberRes.modifiedCount} records\n`);


    // 3. Migrate Users (tenantRole fields for backward compatibility)
    logger.info('🔄 Migrating User collection tenant fields...');

    const userOwnerRes = await UserModel.updateMany(
      { tenantRole: 'owner' },
      { $set: { tenantRole: 'admin', tenantPermissions: ['*'] } }
    );
    logger.info(`   - Updated tenantRole 'owner' to 'admin': ${userOwnerRes.modifiedCount} records`);

    const userAdminRes = await UserModel.updateMany(
      { tenantRole: 'admin' },
      { $set: { tenantRole: 'manager' } }
    );
    logger.info(`   - Updated tenantRole 'admin' to 'manager': ${userAdminRes.modifiedCount} records`);

    const userMemberRes = await UserModel.updateMany(
      { tenantRole: 'member' },
      { $set: { tenantRole: 'user' } }
    );
    logger.info(`   - Updated tenantRole 'member' to 'user': ${userMemberRes.modifiedCount} records\n`);

    logger.info('🎉 Role migration completed successfully!\n');
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed.');
    process.exit(0);
  }
}

// Run migration
migrateTenantRoles();
