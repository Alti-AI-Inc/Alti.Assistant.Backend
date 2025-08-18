# 🎨 Composio v2 Demo Frontend

A beautiful, modern web interface for testing the Phase 2 workflow scheduling system.

## ✨ Features

### 🎯 **AI-Powered Workflow Creation**
- Natural language input for workflow creation
- Automatic schedule detection and parsing
- Smart workflow planning and execution

### 🎛️ **Manual Workflow Management**
- Create workflows with custom parameters
- Set recurring or one-time schedules
- Configure cron expressions

### ⚡ **Instant Execution**
- Execute workflows immediately
- View real-time results
- Test workflow logic without scheduling

### 📊 **Workflow Dashboard**
- View all your workflows
- Manage workflow states (pause/resume)
- View execution history
- Delete workflows

## 🎨 Design Features

### **Modern UI Elements**
- ✅ Gradient backgrounds with glassmorphism effects
- ✅ Smooth animations and hover effects
- ✅ Responsive design for all screen sizes
- ✅ Beautiful color scheme (purple/blue gradients)
- ✅ Font Awesome icons throughout
- ✅ Card-based layout with shadows

### **User Experience**
- ✅ Tabbed interface for easy navigation
- ✅ Loading animations with spinners
- ✅ Success/error alerts with color coding
- ✅ Form validation and feedback
- ✅ Empty states with helpful messages

## 🚀 How to Use

### **1. Start the Demo Server**
```bash
# Option 1: Use the batch file (Windows)
start_demo.bat

# Option 2: Run manually
node demo_server.js
```

### **2. Open in Browser**
Navigate to: `http://localhost:8080`

### **3. Test the Features**

#### **Create AI Workflow:**
1. Go to "Create Workflow" tab
2. Enter natural language description:
   - "Send me a daily GitHub issues summary every morning at 9 AM"
   - "Email me weekly reports every Friday at 5 PM"
   - "Remind me about the meeting tomorrow at 2 PM"
3. Click "Create with AI"

#### **Execute Immediately:**
1. Go to "Execute Now" tab
2. Enter what you want to do:
   - "Get my GitHub issues right now"
   - "Send me the current status of my projects"
3. Click "Execute Now"

#### **Manage Workflows:**
1. Go to "Manage Workflows" tab
2. Click "Refresh Workflows" to load
3. Use action buttons:
   - **Trigger** - Run workflow manually
   - **Pause/Resume** - Control scheduling
   - **History** - View execution logs
   - **Delete** - Remove workflow

## 🧪 Testing Examples

### **Scheduling Workflows**
```javascript
// Daily at specific time
"Send me a daily report at 9 AM"
→ Creates recurring workflow with cron: "0 9 * * *"

// Weekly on specific day
"Email me every Friday at 5 PM"  
→ Creates recurring workflow with cron: "0 17 * * FRI"

// One-time execution
"Remind me tomorrow at 2 PM"
→ Creates one-time workflow for next day at 14:00
```

### **Immediate Execution**
```javascript
// Get current data
"Get my GitHub issues right now"
→ Executes immediately, returns results

// Send immediate notification
"Send me the current project status"
→ Executes workflow and shows response
```

## 🔧 Configuration

### **API Endpoint**
The frontend is configured to connect to:
```javascript
const API_BASE_URL = 'http://localhost:3000/api/composio-v2';
```

Change this in `demo_frontend.html` if your backend runs on a different port.

### **CORS Setup**
Make sure your backend has CORS enabled for `http://localhost:8080`.

## 📁 Files Structure

```
demo_frontend.html     # Main HTML interface
demo_server.js         # Express server to serve the frontend
start_demo.bat        # Windows batch file to start demo
DEMO_README.md        # This documentation
```

## 🎨 UI Components

### **Color Scheme**
- **Primary Gradient**: `#667eea` to `#764ba2` (Purple-Blue)
- **Success**: `#4facfe` to `#00f2fe` (Light Blue)
- **Warning**: `#f093fb` to `#f5576c` (Pink-Red)
- **Danger**: `#fa709a` to `#fee140` (Pink-Yellow)

### **Typography**
- **Font Family**: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif
- **Headers**: Bold with color accents
- **Body**: Clean and readable

### **Effects**
- **Glassmorphism**: Semi-transparent cards with backdrop blur
- **Hover Animations**: Smooth transform and shadow transitions
- **Loading States**: Spinning icons with smooth rotation
- **Gradient Buttons**: Multi-color gradients with hover effects

## 🧪 Testing Workflow

### **1. Backend Preparation**
Ensure your main backend server is running:
```bash
cd d:\ason\ASON-Core-Service-Backend
npm start  # or your usual start command
```

### **2. Frontend Launch**
```bash
# Start demo server
node demo_server.js

# Or use batch file
start_demo.bat
```

### **3. Test Scenarios**

#### **Scenario 1: Daily Automation**
1. Input: "Send me a daily GitHub summary at 9 AM"
2. Expected: Workflow created with daily schedule
3. Verify: Check "Manage Workflows" tab for new workflow

#### **Scenario 2: Weekly Reports**
1. Input: "Email me weekly reports every Friday"
2. Expected: Workflow created with weekly schedule
3. Verify: Cron expression shows "* * * * FRI"

#### **Scenario 3: Immediate Execution**
1. Go to "Execute Now" tab
2. Input: "Get my current GitHub issues"
3. Expected: Immediate execution with results displayed

#### **Scenario 4: Workflow Management**
1. Create a workflow
2. Go to "Manage Workflows" tab
3. Test: Trigger, Pause, Resume, Delete actions

## 📱 Mobile Responsive

The interface is fully responsive and works on:
- ✅ Desktop (1200px+)
- ✅ Tablet (768px - 1199px)
- ✅ Mobile (< 768px)

### **Mobile Adaptations**
- Single column layout on small screens
- Touch-friendly button sizes
- Optimized typography scaling
- Simplified navigation

## 🐛 Troubleshooting

### **Common Issues**

#### **"Network Error" Messages**
- ✅ Check backend server is running on port 3000
- ✅ Verify CORS is enabled in backend
- ✅ Check browser console for detailed errors

#### **"No Workflows Found"**
- ✅ Try creating a workflow first
- ✅ Check if user ID matches in both creation and retrieval
- ✅ Verify database connection in backend

#### **Scheduling Not Working**
- ✅ Test with simple schedules first ("daily at 9 AM")
- ✅ Check backend logs for schedule detection
- ✅ Verify cron expressions are valid

### **Debug Mode**
Open browser dev tools (F12) and check:
- Console logs for JavaScript errors
- Network tab for API call status
- Response bodies for error details

## 🎉 Success Indicators

### **✅ Everything Working Correctly**
- AI workflow creation shows success messages
- Workflows appear in management tab
- Manual triggers execute successfully
- Schedules are detected and saved properly
- UI animations are smooth
- No console errors

### **🔍 Performance Metrics**
- Page load time < 2 seconds
- API responses < 5 seconds
- Smooth animations at 60fps
- Responsive design on all devices

---

## 🎨 **Visual Preview**

The demo features a stunning modern design with:

🌈 **Gradient Backgrounds** - Beautiful purple-to-blue gradients
🪟 **Glassmorphism Effects** - Semi-transparent cards with blur
✨ **Smooth Animations** - Hover effects and transitions
📱 **Responsive Design** - Works perfectly on all devices
🎯 **Intuitive Navigation** - Clean tabbed interface
🎨 **Color-Coded Feedback** - Success/error states with colors

**Ready to test your Phase 2 workflow system in style!** 🚀
