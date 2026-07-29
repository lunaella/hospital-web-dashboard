import { useNavigate } from "react-router-dom";

const imgEllipse66 = "https://www.figma.com/api/mcp/asset/f07e63bf-ab8c-44f6-9e47-24b9229b4d31";
const imgGroup6 = "https://www.figma.com/api/mcp/asset/7ed43ebc-11a1-429b-a3c3-941f47c6dff6";
const imgVector7 = "https://www.figma.com/api/mcp/asset/4e70a1e9-3e56-4d85-90cf-dc65b2e456b6";

// Confirmation modal shown when an admin attempts to end their session.
// Intended to be rendered on top of whatever page triggered it (e.g. Settings),
// so it only implements the dialog + dimmed backdrop, not the page behind it.
export default function LogoutConfirmation() {
  const navigate = useNavigate();

  function handleCancel() {
    navigate(-1);
  }

  function handleConfirm() {
    navigate("/login");
  }

  return (
    <div className="fixed inset-0 z-50 font-poppins">
      <div
        className="absolute inset-0 backdrop-blur-[7.5px] bg-[rgba(217,217,217,0.85)]"
        onClick={handleCancel}
        aria-hidden="true"
      />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-[25px] w-[653px] max-w-[95vw] h-[370px] max-h-[95vh] shadow-[0px_17px_38px_0px_rgba(0,0,0,0.1)]">
        <button
          type="button"
          onClick={handleCancel}
          aria-label="Close"
          className="absolute right-[24px] top-[24px] cursor-pointer"
        >
          <img alt="" className="w-5 h-5" src={imgVector7} />
        </button>

        <div className="absolute left-[41px] top-[57px] w-[66px] h-[58px]">
          <img alt="" className="absolute inset-0 size-full" src={imgEllipse66} />
          <img alt="" className="absolute left-[22px] top-[16px] w-[22px] h-[26px]" src={imgGroup6} />
        </div>

        <h2 className="absolute left-[41px] top-[139px] font-poppins font-bold text-[25px] text-black">
          End Admin Session?
        </h2>

        <p className="absolute left-[41px] top-[180px] w-[571px] font-poppins font-semibold text-[17px] text-[#808080] leading-normal">
          Are you sure you want to end your current session? This will immediately clear your JWT from
          local storage and redirect you to login page.
        </p>

        <button
          type="button"
          onClick={handleCancel}
          className="absolute left-[225px] top-[296px] border-2 border-[#d9d9d9] rounded-[16px] w-[180px] h-[49px] flex items-center justify-center cursor-pointer"
        >
          <span className="font-poppins font-bold text-[17px] text-black">Cancel</span>
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          className="absolute left-[418px] top-[296px] bg-[#ad2b21] rounded-[16px] w-[203px] h-[49px] flex items-center justify-center cursor-pointer"
        >
          <span className="font-poppins font-bold text-[17px] text-white">Confirm Logout</span>
        </button>
      </div>
    </div>
  );
}
