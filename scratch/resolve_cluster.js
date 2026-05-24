import dns from 'dns/promises';

async function main() {
  console.log('Resolving _mongodb._tcp.cluster0.piwgo1l.mongodb.net...');
  try {
    const srv = await dns.resolveSrv('_mongodb._tcp.cluster0.piwgo1l.mongodb.net');
    console.log('SRV Records:', srv);
  } catch (err) {
    console.error('SRV resolve failed:', err.message);
  }

  console.log('\nResolving cluster0.piwgo1l.mongodb.net...');
  try {
    const addresses = await dns.resolve4('cluster0.piwgo1l.mongodb.net');
    console.log('A Records:', addresses);
  } catch (err) {
    console.error('A resolve failed:', err.message);
  }

  console.log('\nResolving cluster0-shard-00-00.piwgo1l.mongodb.net...');
  try {
    const addresses = await dns.resolve4('cluster0-shard-00-00.piwgo1l.mongodb.net');
    console.log('Shard 00-00 A Records:', addresses);
  } catch (err) {
    console.error('Shard 00-00 resolve failed:', err.message);
  }
}

main();
