"""
Pydantic models for API requests
"""
from pydantic import BaseModel, EmailStr, Field, validator


class TaskCheckRequest(BaseModel):
    task_id: int = Field(..., gt=0, description="Task ID must be positive")
    answer: str = Field(..., min_length=1, max_length=10000, description="Answer must be between 1 and 10000 characters")
    email: EmailStr = Field(..., description="Valid email address required")
    
    @validator('answer')
    def validate_answer(cls, v):
        if not v or not v.strip():
            raise ValueError('Answer cannot be empty')
        return v.strip()


class NicknameUpdateRequest(BaseModel):
    email: EmailStr = Field(..., description="Valid email address required")
    nickname: str = Field(..., min_length=1, max_length=50, description="Nickname must be between 1 and 50 characters")
    
    @validator('nickname')
    def validate_nickname(cls, v):
        if not v or not v.strip():
            raise ValueError('Nickname cannot be empty')
        # Remove any HTML tags for security
        import re
        v = re.sub(r'<[^>]+>', '', v)
        return v.strip()


class ReportRequest(BaseModel):
    task_id: int = Field(..., gt=0, description="Task ID must be positive")
    message: str = Field(..., min_length=1, max_length=2000, description="Report message must be between 1 and 2000 characters")
    
    @validator('message')
    def validate_message(cls, v):
        if not v or not v.strip():
            raise ValueError('Message cannot be empty')
        # Remove any HTML tags for security
        import re
        v = re.sub(r'<[^>]+>', '', v).strip()
        # Check length after stripping
        if len(v) < 5:
            raise ValueError('Message must be at least 5 characters after removing whitespace')
        if len(v) > 2000:
            raise ValueError('Message must be at most 2000 characters')
        return v


class TrialTestReportRequest(BaseModel):
    trial_test_id: int = Field(..., gt=0, description="Trial test ID must be positive")
    task_id: int = Field(..., gt=0, description="Trial test task ID must be positive")
    message: str = Field(..., min_length=1, max_length=2000, description="Report message must be between 1 and 2000 characters")

    @validator('message')
    def validate_message(cls, v):
        if not v or not v.strip():
            raise ValueError('Message cannot be empty')
        # Remove any HTML tags for security
        import re
        v = re.sub(r'<[^>]+>', '', v).strip()
        # Check length after stripping
        if len(v) < 5:
            raise ValueError('Message must be at least 5 characters after removing whitespace')
        if len(v) > 2000:
            raise ValueError('Message must be at most 2000 characters')
        return v


class FriendInviteCreateRequest(BaseModel):
    email: EmailStr = Field(..., description="Valid email address required")
    expires_in_days: int = Field(1, ge=1, le=30, description="Invite validity in days (1-30)")


class FriendInviteAcceptRequest(BaseModel):
    email: EmailStr = Field(..., description="Valid email address required")


class FriendBlockRequest(BaseModel):
    email: EmailStr = Field(..., description="Valid email address required")
    blocked_user_id: int = Field(..., gt=0, description="User ID to block")


class FriendRequestCreateRequest(BaseModel):
    email: EmailStr = Field(..., description="Valid email address required")
    receiver_id: int = Field(..., gt=0, description="Receiver user ID")

