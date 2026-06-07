import dns from 'dns';

console.log('Testing resolution of various domains using system DNS...');

const domains = ['google.com', 'generativelanguage.googleapis.com', 'cluster0.piwgo1l.mongodb.net'];

domains.forEach(domain => {
  dns.lookup(domain, (err, address, family) => {
    if (err) {
      console.error(`Lookup for ${domain} failed:`, err.message);
    } else {
      console.log(`Lookup for ${domain} succeeded: ${address} (family: ${family})`);
    }
  });
});
