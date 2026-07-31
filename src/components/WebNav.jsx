import resqLogo from "../assets/resq-logo.png";

const imgResQLogo = resqLogo;
const imgVector = "https://www.figma.com/api/mcp/asset/ca5dbc1b-b473-4cf1-ba70-7818d0937735";
const imgGroup = "https://www.figma.com/api/mcp/asset/66e4a534-bf3e-4895-b543-ec99af3dc935";
const imgGroup1 = "https://www.figma.com/api/mcp/asset/3775bcee-ade1-4525-8a58-e42c43a8feee";
const imgVector1 = "https://www.figma.com/api/mcp/asset/e8673723-cfa1-4c83-9d2b-e2928b02d232";
const imgResQLogo1 = resqLogo;
const imgGroup2 = "https://www.figma.com/api/mcp/asset/1d55f653-b7bf-4403-b364-b661539b56ec";
const imgGroup3 = "https://www.figma.com/api/mcp/asset/ed48664d-29d5-4c56-9013-0f810216bea9";

import { Link } from "react-router-dom";

// property1: "DashboardNav" | "DMNav" | "ReportsNav" | "SettingsNav"
export default function WebNav({ className, property1 = "DashboardNav" }) {
  if (property1 === "DMNav") {
    return (
      <div className={className || "block h-full overflow-clip relative w-[296px]"}>
        <div className="absolute bg-[#751423] h-full left-0 top-0 w-[276px]" />
        <div className="absolute contents left-[36px] top-[36px]">
          <div className="absolute h-[41.558px] left-[36px] top-[36px] w-[54.481px]">
            <div className="absolute inset-[-1.21%_-0.92%_-1.2%_-0.92%]">
              <img alt="" className="block max-w-none size-full" src={imgResQLogo1} />
            </div>
          </div>
          <div className="absolute bg-[rgba(255,255,255,0.25)] h-[38px] left-[100px] top-[38px] w-[1.5px]" />
          <p className="absolute font-poppins font-semibold leading-[normal] left-[112px] not-italic text-[13px] text-[rgba(255,255,255,0.85)] top-[48px] tracking-[0.2em] whitespace-nowrap">
            ADMIN
          </p>
        </div>
        <Link to="/reports" className="absolute contents left-[26px] top-[239px] cursor-pointer">
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[91.5px] not-italic text-[17px] text-center text-white top-[239px] whitespace-nowrap">
            Reports
          </p>
          <div className="absolute left-[26px] top-[241px] w-[18px] h-[20px]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
          </div>
        </Link>
        <Link to="/settings" className="absolute left-0 bottom-0 w-[279px] h-[60px] cursor-pointer">
          <div className="absolute bg-[rgba(217,217,217,0.05)] inset-0" />
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[112.21px] not-italic text-[17px] text-center text-white top-[17px] w-[86.126px]">
            Settings
          </p>
          <div className="absolute left-[30px] top-[16px] w-[21px] h-[18px]">
            <div className="absolute inset-[-5.56%_-4.69%]">
              <img alt="" className="block max-w-none size-full" src={imgGroup2} />
            </div>
          </div>
        </Link>
        <div className="absolute bg-[rgba(217,217,217,0.25)] h-[47px] left-[9px] rounded-[15px] top-[173px] w-[257px]" />
        <Link to="/dashboard" className="absolute contents left-[24px] top-[129px] cursor-pointer">
          <div className="absolute left-[24px] top-[131px] w-[20px] h-[20px]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector1} />
          </div>
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[106.5px] not-italic text-[17px] text-center text-white top-[129px] whitespace-nowrap">
            Dashboard
          </p>
        </Link>
        <div className="absolute contents left-[24px] top-[183px]">
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[145px] not-italic text-[17px] text-center text-white top-[183px] whitespace-nowrap">
            Donor Management
          </p>
          <div className="absolute left-[24px] top-[188px] w-[20px] h-[19px]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector} />
          </div>
        </div>
      </div>
    );
  }
  if (property1 === "ReportsNav") {
    return (
      <div className={className || "block h-full overflow-clip relative w-[296px]"}>
        <div className="absolute bg-[#751423] h-full left-0 top-0 w-[276px]" />
        <div className="absolute contents left-[36px] top-[36px]">
          <div className="absolute h-[41.558px] left-[36px] top-[36px] w-[54.481px]">
            <div className="absolute inset-[-1.21%_-0.92%_-1.2%_-0.92%]">
              <img alt="" className="block max-w-none size-full" src={imgResQLogo1} />
            </div>
          </div>
          <div className="absolute bg-[rgba(255,255,255,0.25)] h-[38px] left-[100px] top-[38px] w-[1.5px]" />
          <p className="absolute font-poppins font-semibold leading-[normal] left-[112px] not-italic text-[13px] text-[rgba(255,255,255,0.85)] top-[48px] tracking-[0.2em] whitespace-nowrap">
            ADMIN
          </p>
        </div>
        <Link to="/settings" className="absolute left-0 bottom-0 w-[279px] h-[60px] cursor-pointer">
          <div className="absolute bg-[rgba(217,217,217,0.05)] inset-0" />
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[112.21px] not-italic text-[17px] text-center text-white top-[17px] w-[86.126px]">
            Settings
          </p>
          <div className="absolute left-[30px] top-[16px] w-[21px] h-[18px]">
            <div className="absolute inset-[-5.56%_-4.69%]">
              <img alt="" className="block max-w-none size-full" src={imgGroup3} />
            </div>
          </div>
        </Link>
        <div className="absolute bg-[rgba(217,217,217,0.25)] h-[47px] left-[10px] rounded-[15px] top-[229px] w-[257px]" />
        <Link to="/dashboard" className="absolute contents left-[24px] top-[129px] cursor-pointer">
          <div className="absolute left-[24px] top-[131px] w-[20px] h-[20px]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector1} />
          </div>
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[106.5px] not-italic text-[17px] text-center text-white top-[129px] whitespace-nowrap">
            Dashboard
          </p>
        </Link>
        <Link to="/donor-management" className="absolute contents left-[24px] top-[183px] cursor-pointer">
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[145px] not-italic text-[17px] text-center text-white top-[183px] whitespace-nowrap">
            Donor Management
          </p>
          <div className="absolute left-[24px] top-[188px] w-[20px] h-[19px]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector} />
          </div>
        </Link>
        <div className="absolute contents left-[26px] top-[239px]">
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[91.5px] not-italic text-[17px] text-center text-white top-[239px] whitespace-nowrap">
            Reports
          </p>
          <div className="absolute left-[26px] top-[241px] w-[18px] h-[20px]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
          </div>
        </div>
      </div>
    );
  }
  if (property1 === "SettingsNav") {
    return (
      <div className={className || "h-full overflow-clip relative w-[296px]"}>
        <div className="absolute bg-[#751423] h-full left-0 top-0 w-[276px]" />
        <div className="absolute contents left-[36px] top-[36px]">
          <div className="absolute h-[41.558px] left-[36px] top-[36px] w-[54.481px]">
            <div className="absolute inset-[-1.21%_-0.92%_-1.2%_-0.92%]">
              <img alt="" className="block max-w-none size-full" src={imgResQLogo1} />
            </div>
          </div>
          <div className="absolute bg-[rgba(255,255,255,0.25)] h-[38px] left-[100px] top-[38px] w-[1.5px]" />
          <p className="absolute font-poppins font-semibold leading-[normal] left-[112px] not-italic text-[13px] text-[rgba(255,255,255,0.85)] top-[48px] tracking-[0.2em] whitespace-nowrap">
            ADMIN
          </p>
        </div>
        <div className="absolute left-0 bottom-0 w-[279px] h-[60px]">
          <div className="absolute bg-[rgba(217,217,217,0.25)] h-[47px] left-[11px] rounded-[15px] top-[6px] w-[257px]" />
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[112.21px] not-italic text-white text-[17px] text-center top-[17px] w-[86.126px]">
            Settings
          </p>
          <div className="absolute left-[30px] top-[19px] w-[21px] h-[18px]">
            <div className="absolute inset-[-5.56%_-4.69%]">
              <img alt="" className="block max-w-none size-full" src={imgGroup1} />
            </div>
          </div>
        </div>
        <Link to="/dashboard" className="absolute contents left-[24px] top-[129px] cursor-pointer">
          <div className="absolute left-[24px] top-[131px] w-[20px] h-[20px]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector1} />
          </div>
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[106.5px] not-italic text-[17px] text-center text-white top-[129px] whitespace-nowrap">
            Dashboard
          </p>
        </Link>
        <Link to="/donor-management" className="absolute contents left-[24px] top-[183px] cursor-pointer">
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[145px] not-italic text-[17px] text-center text-white top-[183px] whitespace-nowrap">
            Donor Management
          </p>
          <div className="absolute left-[24px] top-[188px] w-[20px] h-[19px]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector} />
          </div>
        </Link>
        <Link to="/reports" className="absolute contents left-[26px] top-[239px] cursor-pointer">
          <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[91.5px] not-italic text-[17px] text-center text-white top-[239px] whitespace-nowrap">
            Reports
          </p>
          <div className="absolute left-[26px] top-[241px] w-[18px] h-[20px]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
          </div>
        </Link>
      </div>
    );
  }
  return (
    <div className={className || "h-full overflow-clip relative w-[296px]"}>
      <div className="absolute bg-[#751423] h-full left-0 top-0 w-[276px]" />
      <div className="absolute contents left-[36px] top-[36px]">
        <div className="absolute h-[41.558px] left-[36px] top-[36px] w-[54.481px]">
          <div className="absolute inset-[-1.21%_-0.92%_-1.2%_-0.92%]">
            <img alt="" className="block max-w-none size-full" src={imgResQLogo} />
          </div>
        </div>
        <div className="absolute bg-[rgba(255,255,255,0.25)] h-[38px] left-[100px] top-[38px] w-[1.5px]" />
        <p className="absolute font-poppins font-semibold leading-[normal] left-[112px] not-italic text-[13px] text-[rgba(255,255,255,0.85)] top-[48px] tracking-[0.2em] whitespace-nowrap">
          ADMIN
        </p>
      </div>
      <Link to="/donor-management" className="absolute contents cursor-pointer left-[24px] top-[185px]">
        <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[144px] not-italic text-[17px] text-center text-white top-[185px] whitespace-nowrap">
          Donor Management
        </p>
        <div className="absolute left-[24px] top-[188px] w-[20px] h-[19px]">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector} />
        </div>
      </Link>
      <Link to="/reports" className="absolute contents cursor-pointer left-[26px] top-[239px]">
        <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[91.5px] not-italic text-[17px] text-center text-white top-[239px] whitespace-nowrap">
          Reports
        </p>
        <div className="absolute left-[26px] top-[241px] w-[18px] h-[20px]">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
        </div>
      </Link>
      <Link to="/settings" className="absolute cursor-pointer left-0 bottom-0 w-[279px] h-[60px]">
        <div className="absolute bg-[rgba(217,217,217,0.05)] inset-0" />
        <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[112.21px] not-italic text-[17px] text-center text-white top-[17px] w-[86.126px]">
          Settings
        </p>
        <div className="absolute left-[30px] top-[16px] w-[21px] h-[18px]">
          <div className="absolute inset-[-5.56%_-4.69%]">
            <img alt="" className="block max-w-none size-full" src={imgGroup1} />
          </div>
        </div>
      </Link>
      <div className="absolute bg-[rgba(217,217,217,0.25)] block h-[47px] left-[11px] rounded-[15px] top-[120px] w-[257px]" />
      <div className="absolute contents left-[24px] top-[129px]">
        <div className="absolute left-[24px] top-[131px] w-[20px] h-[20px]">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector1} />
        </div>
        <p className="-translate-x-1/2 absolute font-poppins font-semibold leading-[normal] left-[106.5px] not-italic text-[17px] text-center text-white top-[129px] whitespace-nowrap">
          Dashboard
        </p>
      </div>
    </div>
  );
}
