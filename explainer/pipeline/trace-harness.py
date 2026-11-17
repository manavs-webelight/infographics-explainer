# Trace harness for the M8 trace tool. Runs ONE user script file inside a
# fresh temp dir with hard limits, records up to N states via sys.settrace,
# and writes JSON to trace-out.json (stdout stays clean for user prints).
# Invoked only by pipeline/trace.ts (subprocess, own cwd, wall timeout).
import ast
import importlib.util
import json
import os
import resource
import socket
import sys

# --- limits (self-applied; enforced by the kernel once set) ---
def apply_limits(mem_mb: int, cpu_seconds: int) -> None:
    try:
        resource.setrlimit(resource.RLIMIT_AS, (mem_mb * 1024 * 1024,) * 2)
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
        resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024,) * 2)
    except Exception:
        pass

# --- network kill switch (in-process; the OS-level unshare is added by the
#     node runner when available) ---
def block_network() -> None:
    def _blocked(*_a, **_k):
        raise OSError('network access is disabled by the trace tool')
    socket.socket = _blocked  # type: ignore[misc]
    socket.create_connection = _blocked  # type: ignore
    socket.getaddrinfo = _blocked  # type: ignore

def short(v: object) -> str:
    try:
        r = repr(v)
    except Exception:
        r = '<unrepresentable>'
    return r if len(r) <= 40 else r[:37] + '...'

def main() -> int:
    script, entry, args_repr, max_states = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    apply_limits(int(sys.argv[5]), int(sys.argv[6]))
    block_network()
    target = os.path.abspath(script)
    spec = importlib.util.spec_from_file_location('user_module', target)
    if spec is None or spec.loader is None:
        print('trace: cannot load script', file=sys.stderr)
        return 2
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # module top-level runs under the same limits
    fn = getattr(mod, entry, None)
    if not callable(fn):
        print(f'trace: "{entry}" is not a callable in the script', file=sys.stderr)
        return 2
    args = ast.literal_eval(args_repr)
    if not isinstance(args, tuple):
        args = (args,)

    states: list = []

    def tracer(frame, event, arg):
        if len(states) >= max_states:
            return None
        if frame.f_code.co_filename != target:
            return None  # trace only the user's file
        if event not in ('line', 'return'):
            return tracer
        rec = {
            'n': len(states) + 1,
            'event': event,
            'func': frame.f_code.co_name,
            'line': frame.f_lineno,
            'vars': {k: short(v) for k, v in frame.f_locals.items() if not k.startswith('_')},
        }
        if event == 'return':
            rec['returns'] = short(arg)
        states.append(rec)
        return tracer

    sys.settrace(tracer)
    error = None
    result = None
    try:
        result = fn(*args)
    except BaseException as e:  # noqa: capture user errors for the report
        error = short(e)
    finally:
        sys.settrace(None)

    out = {
        'entry': entry,
        'args': args_repr,
        'limit': max_states,
        'truncated': len(states) >= max_states,
        'error': error,
        'states': states,
        'result': short(result) if error is None else None,
    }
    with open('trace-out.json', 'w') as f:
        json.dump(out, f, indent=1)
    return 0 if error is None else 3

if __name__ == '__main__':
    sys.exit(main())
