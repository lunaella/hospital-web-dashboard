import { useNavigate } from "react-router-dom";
import { useState } from "react";

const imgRectangle = "https://www.figma.com/api/mcp/asset/7ec8919e-e59d-40ed-9569-8bf00e49c62f";
const imgResQLogo = "https://www.figma.com/api/mcp/asset/8d00b1cd-6c30-470f-805e-b61efe2f8069";

export default function LoginFailed() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function handleLogin(e) {
    e.preventDefault();
    if (username.trim() && password.trim()) {
      navigate("/dashboard");
    } else {
      navigate("/login-failed");
    }
  }

  return (
    <div className="bg-gradient-to-b from-[#fefefe] relative w-[1440px] h-[1024px] mx-auto to-[#8d8d8d] to-[38.462%]">
      <div className="absolute bg-gradient-to-l from-[#9f5c5d] h-[651px] left-[203px] shadow-[0px_436px_122px_0px_rgba(0,0,0,0),0px_279px_112px_0px_rgba(0,0,0,0.01),0px_157px_94px_0px_rgba(0,0,0,0.05),0px_70px_70px_0px_rgba(0,0,0,0.09),0px_17px_38px_0px_rgba(0,0,0,0.1)] to-[#680707] to-[46.635%] top-[166px] w-[1034px]" />
      <div className="absolute h-[107px] left-[258px] top-[223px] w-[140.727px]">
        <div className="absolute inset-[-0.47%_-0.36%]">
          <img alt="" className="block max-w-none size-full" src={imgResQLogo} />
        </div>
      </div>
      <p className="-translate-x-1/2 absolute font-poppins font-bold h-[45px] leading-[0] left-[469px] not-italic text-[0px] text-center top-[227px] w-[118px]">
        <span className="leading-[normal] text-[#d9d9d9] text-[45px]">Res</span>
        <span className="leading-[normal] text-[#81b562] text-[45px]">Q</span>
      </p>
      <p className="-translate-x-1/2 absolute font-poppins font-medium leading-[normal] left-[521px] not-italic text-[#edfdeb] text-[15px] text-center top-[288px] whitespace-nowrap">
        Connect, Save Lives, On time.
      </p>
      <div className="absolute flex h-[537.445px] items-center justify-center left-[97.84px] top-[317.84px] w-[384.673px]">
        <div className="flex-none rotate-[22.84deg]">
          <div className="h-[495.222px] relative w-[208.812px]">
            <div className="absolute inset-0 opacity-75 overflow-hidden pointer-events-none">
              <img alt="" className="absolute h-full left-[-68.89%] max-w-none top-0 w-[237.16%]" src={imgRectangle} />
            </div>
          </div>
        </div>
      </div>
      <form onSubmit={handleLogin}>
        <div className="absolute bg-[rgba(217,217,217,0.55)] h-[358px] left-[598px] rounded-[15px] top-[383px] w-[510px]" />
        <p className="-translate-x-1/2 absolute font-poppins font-medium leading-[normal] left-[852.5px] not-italic text-[18px] text-center text-white top-[412px] w-[343px]">
          Welcome! Please enter username and password to login
        </p>
        <label className="-translate-x-1/2 absolute font-poppins font-medium leading-[normal] left-[707.5px] not-italic text-[20px] text-center text-white top-[492px] whitespace-nowrap">
          Username
        </label>
        <label className="-translate-x-1/2 absolute font-poppins font-medium leading-[normal] left-[704px] not-italic text-[20px] text-center text-white top-[547px] whitespace-nowrap">
          Password
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="absolute bg-[#d9d9d9] h-[39px] left-[791px] top-[487px] w-[260px] rounded-[3px] px-2 outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="absolute bg-[#d9d9d9] h-[39px] left-[791px] top-[547px] w-[260px] rounded-[3px] px-2 outline-none"
        />
        <button type="submit" className="absolute contents cursor-pointer left-[929px] top-[615px]">
          <div className="absolute bg-[#d9d9d9] h-[37px] left-[929px] rounded-[5px] top-[615px] w-[122px] hover:bg-white transition-colors" />
          <p className="-translate-x-1/2 absolute font-poppins font-medium leading-[normal] left-[989.5px] not-italic text-[15px] text-black text-center top-[622px] w-[83px]">
            Login
          </p>
        </button>
        <p className="-translate-x-1/2 absolute font-poppins font-medium leading-[normal] left-[852.5px] not-italic text-[18px] text-[red] text-center top-[676px] w-[343px]">
          Wrong Credentials! Please try again.
        </p>
      </form>
    </div>
  );
}
