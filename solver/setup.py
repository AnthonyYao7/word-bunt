from setuptools import setup
from pybind11.setup_helpers import Pybind11Extension, build_ext

ext_modules = [
    Pybind11Extension(
        "wordhunt_cpp",
        ["wordhunt_cpp.cpp"],
        cxx_std=17,
    )
]

setup(
    name="wordhunt_cpp",
    version="0.1.0",
    ext_modules=ext_modules,
    cmdclass={"build_ext": build_ext},
)
