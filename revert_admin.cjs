const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'app', 'modules', 'admin', 'admin.route.js');
let content = fs.readFileSync(file, 'utf8');

// Replace "auth(ENUM_USER_ROLE.SUPER_ADMIN)," with "auth(ENUM_USER_ROLE.ADMIN),"
content = content.replace(/auth\(ENUM_USER_ROLE\.SUPER_ADMIN\),/g, 'auth(ENUM_USER_ROLE.ADMIN),');
// Note: we can also remove the comments if we want, but just changing the auth is enough.

fs.writeFileSync(file, content);
console.log('Reverted admin.route.js roles to ADMIN');
