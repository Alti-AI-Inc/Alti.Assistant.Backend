import mongoose from "mongoose";

const AuthConfigSchema = mongoose.Schema({
  app: {
    type: String,
    required: true
  },
  authConfigId: {
    type: String,
    required: true
  },
  authSchema: {
    type: String,
    required: false
  },
  isComposioManaged: {
    type: Boolean,
    default: false
  }
})

const AuthConfig = mongoose.model("AuthConfig", AuthConfigSchema);

export default AuthConfig;