import dns from 'dns';

console.log('Testing custom DNS servers (8.8.8.8, 1.1.1.1)...');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  console.log('Successfully set DNS servers.');
} catch (e) {
  console.error('Failed to set DNS servers:', e.message);
}

dns.lookup('google.com', (err, address) => {
  if (err) {
    console.error('google.com lookup failed:', err.message);
  } else {
    console.log('google.com lookup succeeded:', address);
  }
});

dns.resolveSrv('_mongodb._tcp.cluster0.piwgo1l.mongodb.net', (err, addresses) => {
  if (err) {
    console.error('SRV Resolution failed:', err.message);
  } else {
    console.log('SRV Resolution succeeded:', addresses);
  }
});
