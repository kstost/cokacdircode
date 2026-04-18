# How to Start Your First Chat

## Start a Session

When chatting with the bot 1:1 for the first time, type `/start`. This creates a temporary working directory where the bot can perform tasks.

When you send your first message after `/start`, an actual session is created on the coding agent, and each session is assigned a unique ID. You can check this ID with the `/session` command. You can also use this ID to resume the session directly from the coding agent's CLI.

## Check Available Models

Type `/model` to see the list of available models. The list reflects the agents actually installed on the system where cokacdir is running. Make sure the agent you want to use is installed beforehand.

## Set a Model

Type `/model [model name]` to set a model. Note that switching to a different model from the one currently in use will exit the current session.

## Check Working Directory

Type `/pwd` to see the current working directory path.

## Clear Conversation Context

Type `/clear` to discard the current session and start a new one. The previous session is not deleted — it is abandoned, and a fresh session begins.
