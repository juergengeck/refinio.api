export interface Message {
  id: string;
  type: MessageType;
  timestamp: number;
  payload: any;
}

export enum MessageType {
  // Authentication
  AUTH_CHALLENGE = 'auth.challenge',
  AUTH_REQUEST = 'auth.request',
  AUTH_RESPONSE = 'auth.response',
  
  // CRUD Operations
  CREATE_REQUEST = 'crud.create.request',
  CREATE_RESPONSE = 'crud.create.response',
  READ_REQUEST = 'crud.read.request',
  READ_RESPONSE = 'crud.read.response',
  UPDATE_REQUEST = 'crud.update.request',
  UPDATE_RESPONSE = 'crud.update.response',
  DELETE_REQUEST = 'crud.delete.request',
  DELETE_RESPONSE = 'crud.delete.response',
  
  // Recipe Operations
  RECIPE_EXECUTE = 'recipe.execute',
  RECIPE_RESULT = 'recipe.result',
  
  // Streaming
  STREAM_SUBSCRIBE = 'stream.subscribe',
  STREAM_EVENT = 'stream.event',
  STREAM_UNSUBSCRIBE = 'stream.unsubscribe'
}

export enum ErrorCode {
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  VALIDATION_ERROR = 422,
  INTERNAL_ERROR = 500
}

export interface ErrorResponse {
  id: string;
  type: 'error';
  error: {
    code: ErrorCode;
    message: string;
    details?: any;
  };
}

export interface ClientIdentityCredential {
  $type$: 'ClientIdentityCredential';
  id: string;
  issuer: string;
  credentialSubject: {
    id: string;
    publicKeyHex: string;
    type: string;
    permissions: string[];
  };
  issuanceDate: string;
  expirationDate: string;
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofValue: string;
  };
}