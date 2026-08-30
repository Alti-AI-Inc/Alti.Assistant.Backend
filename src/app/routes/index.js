import express from 'express';
import { authRoutes } from '../modules/auth/auth.route.js';

import { subscriptionRoutes } from '../modules/payment/payment.route.js';
import newSubscriptionRoutes from '../modules/subscription/subscription.routes.js';

import { adminRoutes } from '../modules/admin/admin.route.js';
import { notificationRoutes } from '../modules/notification/notification.route.js';
import { socialLoginRotes } from '../modules/social-login/social-login.route.js';
import { supportRoutes } from '../modules/support/support.route.js';

import { stripeRoutes } from '../modules/stripe/stripe.route.js';
import { tenantRoutes } from '../modules/tenant/tenant.route.js';

import { SpaceRoutes } from '../modules/Space/space.route.js';
import { usageRoutes } from '../modules/usage/usage.route.js';

const router = express.Router();

const moduleRoutes = [
  {
    path: '/tenant',
    route: tenantRoutes,
  },
  {
    path: '/admin',
    route: adminRoutes,
  },
  {
    path: '/auth',
    route: authRoutes,
  },
  {
    path: '/auth-social',
    route: socialLoginRotes,
  },
  {
    path: '/support',
    route: supportRoutes,
  },
  {
    path: '/subscription',
    route: subscriptionRoutes,
  },
  {
    path: '/subscriptions',
    route: newSubscriptionRoutes,
  },
  {
    path: '/notification',
    route: notificationRoutes,
  },
  {
    path: '/stripe',
    route: stripeRoutes,
  },
  {
    path: '/usage',
    route: usageRoutes,
  },
  {
    path: '/spaces',
    route: SpaceRoutes,
  },
];

moduleRoutes.forEach((route) => {
  return router.use(route.path, route.route);
});

router.get('/logos/:app_name', (req, res) => {
  const appName = req.params.app_name || '';
  const cleanName = appName.replace(/[^a-zA-Z0-9]/g, '');
  const initial = cleanName.charAt(0).toUpperCase() || 'A';

  let hash = 0;
  for (let i = 0; i < appName.length; i++) {
    hash = appName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#3B82F6',
    '#EF4444',
    '#10B981',
    '#F59E0B',
    '#8B5CF6',
    '#EC4899',
    '#06B6D4',
    '#14B8A6',
    '#6366F1',
    '#84CC16',
  ];
  const color = colors[Math.abs(hash) % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <rect width="100" height="100" rx="24" fill="${color}"/>
    <text x="50" y="62" font-family="system-ui, -apple-system, sans-serif" font-size="40" font-weight="bold" fill="#ffffff" text-anchor="middle">${initial}</text>
  </svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

export default router;
