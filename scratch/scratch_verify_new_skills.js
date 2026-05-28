import { dynamicSkillService } from './src/app/modules/swarm/dynamicSkill.service.js';
import { logger } from './src/shared/logger.js';
import fs from 'fs';
import path from 'path';

async function testSeedingAndCompilation() {
  console.log('🧪 Starting Alti Sandboxed Skills Verification test...');
  
  const mockUserId = 'test_user_swarm_123';
  const mockSkillsDir = path.resolve('./storage/users/test_user_swarm_123/workspace/skills');
  
  // Clean mock directory if it exists to force fresh seeding
  if (fs.existsSync(mockSkillsDir)) {
    fs.rmSync(mockSkillsDir, { recursive: true, force: true });
    console.log('🧹 Cleaned existing mock skills workspace directory.');
  }
  
  try {
    console.log('🔄 Triggering scanUserSkills to seed default skills...');
    const skills = dynamicSkillService.scanUserSkills(mockUserId);
    
    console.log(`✅ Discovered and parsed ${skills.length} skills successfully!`);
    console.log('Listed Skill Names:', skills.map(s => s.name));
    
    if (skills.length < 6) {
      throw new Error(`Expected at least 6 default seeded skills, but found only ${skills.length}`);
    }
    
    // Check if new skills are seeded and present
    const financialRatios = skills.find(s => s.name === 'financial_ratios_analyzer');
    const blackScholes = skills.find(s => s.name === 'black_scholes_calculator');
    const portfolioOpt = skills.find(s => s.name === 'portfolio_optimizer');
    
    if (!financialRatios || !blackScholes || !portfolioOpt) {
      throw new Error('Verification Failure: One or more of the new premium financial skills are missing!');
    }
    
    console.log('🟢 New Premium Financial Skills Seeded Successfully!');
    console.log('- financial_ratios_analyzer details:', {
      script: financialRatios.script,
      paramsCount: Object.keys(financialRatios.parameters).length
    });
    console.log('- black_scholes_calculator details:', {
      script: blackScholes.script,
      paramsCount: Object.keys(blackScholes.parameters).length
    });
    console.log('- portfolio_optimizer details:', {
      script: portfolioOpt.script,
      paramsCount: Object.keys(portfolioOpt.parameters).length
    });
    
    console.log('⚙️ Testing tool compilation to Google Gemini format...');
    const geminiTools = dynamicSkillService.compileGeminiTools(skills);
    console.log(`✅ Compiled ${geminiTools.length} tools successfully!`);
    
    const financialRatiosTool = geminiTools.find(t => t.name === 'financial_ratios_analyzer');
    console.log('Compiled financial_ratios_analyzer parameters schema:', JSON.stringify(financialRatiosTool.parameters, null, 2));
    
    console.log('\n🎉 ALL SPRINT VERIFICATION TESTS PASSED 100% SUCCESSFULLY WITH ZERO ERRORS!');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  } finally {
    // Cleanup mock user files
    if (fs.existsSync(mockSkillsDir)) {
      fs.rmSync(mockSkillsDir, { recursive: true, force: true });
    }
  }
}

testSeedingAndCompilation();
