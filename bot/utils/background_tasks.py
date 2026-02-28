"""
Background tasks for heavy operations
"""
import asyncio
import logging
from typing import Callable, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class BackgroundTaskQueue:
    """Simple background task queue"""
    
    def __init__(self):
        self.tasks: list = []
        self.running = False
    
    async def add_task(
        self,
        func: Callable,
        *args,
        **kwargs
    ) -> asyncio.Task:
        """
        Add a task to background queue
        
        Args:
            func: Async function to execute
            *args: Positional arguments for function
            **kwargs: Keyword arguments for function
        
        Returns:
            asyncio.Task: Task object
        """
        task = asyncio.create_task(self._execute_task(func, *args, **kwargs))
        self.tasks.append(task)
        return task
    
    async def _execute_task(self, func: Callable, *args, **kwargs) -> Any:
        """Execute task with error handling"""
        try:
            result = await func(*args, **kwargs)
            logger.debug(f"Background task completed: {func.__name__}")
            return result
        except Exception as e:
            logger.error(f"Background task failed: {func.__name__}: {e}", exc_info=True)
            raise
    
    async def wait_for_tasks(self, timeout: Optional[float] = None) -> None:
        """Wait for all tasks to complete"""
        if not self.tasks:
            return
        
        try:
            await asyncio.wait_for(
                asyncio.gather(*self.tasks, return_exceptions=True),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            logger.warning(f"Background tasks timeout after {timeout}s")
    
    def get_stats(self) -> dict:
        """Get task queue statistics"""
        completed = sum(1 for t in self.tasks if t.done())
        return {
            "total_tasks": len(self.tasks),
            "completed_tasks": completed,
            "pending_tasks": len(self.tasks) - completed
        }


# Global background task queue
background_queue = BackgroundTaskQueue()


async def run_in_background(func: Callable, *args, **kwargs) -> asyncio.Task:
    """
    Run a function in background
    
    Args:
        func: Async function to execute
        *args: Positional arguments
        **kwargs: Keyword arguments
    
    Returns:
        asyncio.Task: Task object
    """
    return await background_queue.add_task(func, *args, **kwargs)
