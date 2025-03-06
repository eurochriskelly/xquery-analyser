# Xquery module types

All Xquery modules may declare variables and functions. All XQuery modules may import functions from other xquery modules.

## Library modules

Library modules are Xquery modules containing only functions. There non-private functions and variables may be imported into other functions. These are meant for sharing as libraries with different client code and tests. Library modules will always have a namespace. e.g.

    declare namespace mylib = 'my/library';

# Main modules

Are entry point modules. 

- They may define functions but the namespace must be "local". 
- Main modules will always execute xquery code direclty at the bottom of the function. The simplest possible form is to return an empty sequence.
- Main modules may contain multile transactions separated by semi-colons ';'.
- They may also have external variables which have the keyword external in the declaration.
- Main modules behave like one big main function without the function wrappere.

