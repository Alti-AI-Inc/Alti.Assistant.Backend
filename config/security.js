import helmet from 'helmet';

export const applySecurityMiddleware = app => {
  app.use(helmet());

  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'cdnjs.cloudflare.com',
          'js.stripe.com',
          'cdn.jsdelivr.net',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
        fontSrc: ["'self'", 'fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
        blockAllMixedContent: [],
        frameAncestors: ["'none'"],
      },
    }),
  );

  app.use(helmet.referrerPolicy({ policy: 'same-origin' }));
  app.use(helmet.frameguard({ action: 'deny' }));
  app.use(helmet.noSniff());
  app.use(helmet.xssFilter());
  app.use(helmet.hidePoweredBy());

  app.disable('x-powered-by');
  app.disable('etag');
};
