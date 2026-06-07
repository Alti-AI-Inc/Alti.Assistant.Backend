import dns from 'dns';

console.log('Testing host resolution using system DNS...');

dns.resolveSrv('_mongodb._tcp.cluster0.piwgo1l.mongodb.net', (err, addresses) => {
  if (err) {
    console.error('SRV Resolution failed:', err);
  } else {
    console.log('SRV Resolution succeeded:', addresses);
  }
});

dns.lookup('cluster0.piwgo1l.mongodb.net', (err, address, family) => {
  if (err) {
    console.error('Normal Lookup failed:', err);
  } else {
    console.log('Normal Lookup succeeded:', address, 'family:', family);
  }
});
